#include "SetImporter.hpp"

#include <matio.h>

#include <cstring>
#include <filesystem>
#include <fstream>
#include <vector>

namespace dataminer::importers {

namespace {

namespace fs = std::filesystem;
using core::ChannelInfo;
using core::Event;
using core::EpochInfo;
using core::SignalBuffer;
using core::SignalData;
using core::SignalMetadata;

// RAII: garantiza Mat_Close incluso si una excepción interrumpe la importación.
class MatFileGuard {
public:
    explicit MatFileGuard(const std::string& path) {
        mat_ = Mat_Open(path.c_str(), MAT_ACC_RDONLY);
        if (!mat_) {
            throw SetImportError("No se pudo abrir el archivo .set: " + path);
        }
    }
    ~MatFileGuard() {
        if (mat_) Mat_Close(mat_);
    }
    MatFileGuard(const MatFileGuard&) = delete;
    MatFileGuard& operator=(const MatFileGuard&) = delete;

    mat_t* get() const noexcept { return mat_; }

private:
    mat_t* mat_ = nullptr;
};

// RAII para una variable de nivel superior leída con Mat_VarRead(). A
// diferencia de los matvar_t que devuelve Mat_VarGetStructFieldByName()
// (punteros internos que NO deben liberarse por separado), estas sí son
// dueñas de su memoria y deben liberarse individualmente con Mat_VarFree.
class OwnedVar {
public:
    explicit OwnedVar(matvar_t* var) : var_(var) {}
    ~OwnedVar() {
        if (var_) Mat_VarFree(var_);
    }
    OwnedVar(const OwnedVar&) = delete;
    OwnedVar& operator=(const OwnedVar&) = delete;

    matvar_t* get() const noexcept { return var_; }
    operator matvar_t*() const noexcept { return var_; }

private:
    matvar_t* var_ = nullptr;
};

// Convierte un matvar_t de clase MAT_C_CHAR a std::string. EEGLAB/MATLAB
// guarda char arrays como UINT8/UTF8 (1 byte/carácter) o UINT16/UTF16
// (2 bytes/carácter, se toma el byte bajo — válido para el contenido ASCII
// que EEGLAB usa en labels/event types).
std::string matVarToString(const matvar_t* var) {
    if (!var || var->class_type != MAT_C_CHAR || !var->data) {
        return "";
    }
    std::size_t n = 1;
    for (int i = 0; i < var->rank; ++i) n *= var->dims[i];

    std::string result;
    result.reserve(n);
    if (var->data_type == MAT_T_UINT16 || var->data_type == MAT_T_UTF16) {
        const auto* chars = static_cast<const std::uint16_t*>(var->data);
        for (std::size_t i = 0; i < n; ++i) result.push_back(static_cast<char>(chars[i] & 0xFF));
    } else {
        const auto* chars = static_cast<const unsigned char*>(var->data);
        for (std::size_t i = 0; i < n; ++i) result.push_back(static_cast<char>(chars[i]));
    }
    return result;
}

bool matVarIsEmpty(const matvar_t* var) {
    if (!var || !var->data || var->class_type == MAT_C_EMPTY) return true;
    std::size_t n = 1;
    for (int i = 0; i < var->rank; ++i) n *= var->dims[i];
    return n == 0;
}

// Convierte un matvar_t numérico escalar (o su primer elemento) a double.
// found=false si el campo está ausente/vacío (p.ej. duration sin usar).
double matVarToScalarDouble(const matvar_t* var, bool* found = nullptr) {
    if (found) *found = false;
    if (matVarIsEmpty(var)) return 0.0;
    if (found) *found = true;
    switch (var->data_type) {
        case MAT_T_DOUBLE:
            return static_cast<const double*>(var->data)[0];
        case MAT_T_SINGLE:
            return static_cast<double>(static_cast<const float*>(var->data)[0]);
        case MAT_T_INT32:
            return static_cast<double>(static_cast<const std::int32_t*>(var->data)[0]);
        case MAT_T_UINT8:
            return static_cast<double>(static_cast<const std::uint8_t*>(var->data)[0]);
        default:
            return 0.0;
    }
}

// Copia datos de layout MATLAB (canal-más-rápido / column-major sobre
// [nbchan, pnts, trials]) al layout interno canal-contiguo de SignalBuffer
// (ver docs/adr/003-internal-representation.md). Es una transposición real,
// no una simple copia de bytes.
template <typename SourceT>
void transposeToChannelContiguous(const SourceT* src, std::size_t n_channels,
                                   std::size_t n_samples_total, SignalBuffer& out) {
    for (std::size_t sample = 0; sample < n_samples_total; ++sample) {
        const SourceT* row = src + sample * n_channels;
        for (std::size_t ch = 0; ch < n_channels; ++ch) {
            out.at(ch, sample) = static_cast<float>(row[ch]);
        }
    }
}

std::size_t productOfDims(const matvar_t* var) {
    std::size_t n = 1;
    for (int i = 0; i < var->rank; ++i) n *= var->dims[i];
    return n;
}

// data_var: numérico -> datos inline; MAT_C_CHAR -> nombre de un .fdt externo
// a resolver junto al .set (ADR-002). Devuelve el buffer ya transpuesto a
// layout canal-contiguo.
SignalBuffer readDataField(matvar_t* data_var, const fs::path& set_dir, std::size_t n_channels,
                            std::size_t n_samples_total) {
    if (!data_var) {
        throw SetImportError("El archivo no tiene la variable 'data'");
    }

    if (data_var->class_type == MAT_C_CHAR) {
        // Caso .fdt externo (ADR-002).
        std::string fdt_name = matVarToString(data_var);
        fs::path fdt_path = set_dir / fdt_name;
        if (!fs::exists(fdt_path)) {
            throw SetImportError("'data' referencia '" + fdt_name +
                                  "' pero no se encontró junto al .set en: " + fdt_path.string());
        }

        std::uintmax_t expected_bytes = n_channels * n_samples_total * sizeof(float);
        std::uintmax_t actual_bytes = fs::file_size(fdt_path);
        if (actual_bytes != expected_bytes) {
            throw SetImportError("Tamaño de .fdt inconsistente con las dimensiones declaradas: " +
                                  fdt_path.string() + " tiene " + std::to_string(actual_bytes) +
                                  " bytes, se esperaban " + std::to_string(expected_bytes));
        }

        std::ifstream file(fdt_path, std::ios::binary);
        if (!file) {
            throw SetImportError("No se pudo abrir el .fdt: " + fdt_path.string());
        }
        std::vector<float> raw(n_channels * n_samples_total);
        file.read(reinterpret_cast<char*>(raw.data()),
                  static_cast<std::streamsize>(expected_bytes));
        if (!file) {
            throw SetImportError("Error leyendo el .fdt: " + fdt_path.string());
        }

        SignalBuffer buffer(n_channels, n_samples_total);
        transposeToChannelContiguous(raw.data(), n_channels, n_samples_total, buffer);
        return buffer;
    }

    // Caso inline: los datos numéricos ya están en el .mat.
    if (productOfDims(data_var) != n_channels * n_samples_total) {
        throw SetImportError("'data' tiene " + std::to_string(productOfDims(data_var)) +
                              " elementos; se esperaban " +
                              std::to_string(n_channels * n_samples_total) +
                              " (nbchan * pnts * trials)");
    }

    SignalBuffer buffer(n_channels, n_samples_total);
    if (data_var->data_type == MAT_T_SINGLE) {
        transposeToChannelContiguous(static_cast<const float*>(data_var->data), n_channels,
                                      n_samples_total, buffer);
    } else if (data_var->data_type == MAT_T_DOUBLE) {
        transposeToChannelContiguous(static_cast<const double*>(data_var->data), n_channels,
                                      n_samples_total, buffer);
    } else {
        throw SetImportError("'data' inline tiene un tipo numérico no soportado (data_type=" +
                              std::to_string(static_cast<int>(data_var->data_type)) + ")");
    }
    return buffer;
}

std::vector<ChannelInfo> readChanlocs(matvar_t* chanlocs, std::size_t n_channels) {
    std::vector<ChannelInfo> channels;
    if (!chanlocs || matVarIsEmpty(chanlocs)) {
        // chanlocs vacío es válido (dataset sin posiciones de electrodos);
        // igual generamos labels genéricos para no perder la cuenta de canales.
        channels.reserve(n_channels);
        for (std::size_t i = 0; i < n_channels; ++i) {
            channels.push_back(ChannelInfo{"ch" + std::to_string(i + 1), "", {}, {}, {}});
        }
        return channels;
    }

    channels.reserve(n_channels);
    for (std::size_t i = 0; i < n_channels; ++i) {
        ChannelInfo info;
        matvar_t* label_var = Mat_VarGetStructFieldByName(chanlocs, "labels", i);
        info.label = matVarToString(label_var);
        if (info.label.empty()) info.label = "ch" + std::to_string(i + 1);

        bool found = false;
        matvar_t* x = Mat_VarGetStructFieldByName(chanlocs, "X", i);
        double xv = matVarToScalarDouble(x, &found);
        if (found) info.pos_x = xv;
        matvar_t* y = Mat_VarGetStructFieldByName(chanlocs, "Y", i);
        double yv = matVarToScalarDouble(y, &found);
        if (found) info.pos_y = yv;
        matvar_t* z = Mat_VarGetStructFieldByName(chanlocs, "Z", i);
        double zv = matVarToScalarDouble(z, &found);
        if (found) info.pos_z = zv;

        channels.push_back(std::move(info));
    }
    return channels;
}

std::vector<Event> readEvents(matvar_t* event_arr) {
    std::vector<Event> events;
    if (!event_arr || matVarIsEmpty(event_arr)) {
        return events; // dataset sin eventos: válido, no es un error.
    }

    std::size_t n_events = productOfDims(event_arr);
    char* const* field_names = Mat_VarGetStructFieldnames(event_arr);
    unsigned n_fields = Mat_VarGetNumberOfFields(event_arr);

    events.reserve(n_events);
    for (std::size_t i = 0; i < n_events; ++i) {
        Event ev;

        matvar_t* type_var = Mat_VarGetStructFieldByName(event_arr, "type", i);
        if (type_var && type_var->class_type == MAT_C_CHAR) {
            ev.type = matVarToString(type_var);
        } else if (type_var) {
            bool found = false;
            double v = matVarToScalarDouble(type_var, &found);
            ev.type = found ? std::to_string(v) : "";
        }

        matvar_t* latency_var = Mat_VarGetStructFieldByName(event_arr, "latency", i);
        ev.latency_samples = matVarToScalarDouble(latency_var);

        matvar_t* duration_var = Mat_VarGetStructFieldByName(event_arr, "duration", i);
        ev.duration_samples = matVarToScalarDouble(duration_var);

        for (unsigned f = 0; f < n_fields; ++f) {
            std::string name = field_names[f];
            if (name == "type" || name == "latency" || name == "duration") continue;
            matvar_t* field_var = Mat_VarGetStructFieldByName(event_arr, name.c_str(), i);
            if (!field_var || matVarIsEmpty(field_var)) continue;
            if (field_var->class_type == MAT_C_CHAR) {
                ev.extra_fields[name] = matVarToString(field_var);
            } else {
                bool found = false;
                double v = matVarToScalarDouble(field_var, &found);
                if (found) ev.extra_fields[name] = std::to_string(v);
            }
        }

        events.push_back(std::move(ev));
    }
    return events;
}

} // namespace

core::SignalData importSet(const std::string& set_path) {
    if (!fs::exists(set_path)) {
        throw SetImportError("Archivo .set no encontrado: " + set_path);
    }

    MatFileGuard mat(set_path);

    // EEGLAB guarda .set con `save(..., '-struct', 'EEG')`, que APLANA el
    // struct EEG en variables de nivel superior individuales (nbchan, srate,
    // data, chanlocs, event, ...) en vez de una única variable struct "EEG"
    // anidada. Confirmado empíricamente contra datos reales (OpenNeuro
    // ds004504) — no asumir la forma anidada.
    OwnedVar srate_var(Mat_VarRead(mat.get(), "srate"));
    OwnedVar nbchan_var(Mat_VarRead(mat.get(), "nbchan"));
    OwnedVar pnts_var(Mat_VarRead(mat.get(), "pnts"));
    OwnedVar trials_var(Mat_VarRead(mat.get(), "trials"));
    OwnedVar xmin_var(Mat_VarRead(mat.get(), "xmin"));
    OwnedVar xmax_var(Mat_VarRead(mat.get(), "xmax"));
    OwnedVar ref_var(Mat_VarRead(mat.get(), "ref"));
    OwnedVar subject_var(Mat_VarRead(mat.get(), "subject"));
    OwnedVar chanlocs_var(Mat_VarRead(mat.get(), "chanlocs"));
    OwnedVar event_var(Mat_VarRead(mat.get(), "event"));
    OwnedVar data_var(Mat_VarRead(mat.get(), "data"));

    bool found = false;
    double srate = matVarToScalarDouble(srate_var, &found);
    if (!found || srate <= 0.0) {
        throw SetImportError("'srate' ausente o inválido en: " + set_path);
    }

    auto nbchan_d = matVarToScalarDouble(nbchan_var, &found);
    if (!found) throw SetImportError("'nbchan' ausente en: " + set_path);
    auto n_channels = static_cast<std::size_t>(nbchan_d);

    auto pnts_d = matVarToScalarDouble(pnts_var, &found);
    if (!found) throw SetImportError("'pnts' ausente en: " + set_path);
    auto pnts = static_cast<std::size_t>(pnts_d);

    auto trials_d = matVarToScalarDouble(trials_var, &found);
    std::size_t trials = found && trials_d > 0.0 ? static_cast<std::size_t>(trials_d) : 1;

    std::size_t n_samples_total = pnts * trials;

    SignalMetadata metadata;
    metadata.sampling_rate_hz = srate;
    metadata.channels = readChanlocs(chanlocs_var, n_channels);
    metadata.events = readEvents(event_var);
    metadata.reference = matVarToString(ref_var);
    metadata.subject_id = matVarToString(subject_var);
    metadata.source_path = set_path;

    if (trials > 1) {
        EpochInfo epochs;
        epochs.n_epochs = trials;
        epochs.samples_per_epoch = pnts;
        epochs.epoch_start_seconds = matVarToScalarDouble(xmin_var);
        epochs.epoch_end_seconds = matVarToScalarDouble(xmax_var);
        metadata.epochs = epochs;
    }

    fs::path set_dir = fs::path(set_path).parent_path();
    SignalBuffer buffer = readDataField(data_var, set_dir, n_channels, n_samples_total);

    SignalData signal(std::move(metadata), std::move(buffer));
    if (!signal.isConsistent()) {
        throw SetImportError("El SignalData importado de '" + set_path +
                              "' no pasa la validación de consistencia interna");
    }
    return signal;
}

} // namespace dataminer::importers
