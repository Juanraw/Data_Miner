// Fabrica un .set + .fdt sintéticos mínimos (sin datasets externos, para que
// corra dentro del build de Docker sin depender de red ni de datos reales) y
// verifica que SetImporter resuelve correctamente la ruta EEG.data -> .fdt
// externo descrita en docs/adr/002-fdt-companion-files.md. La ruta de datos
// inline se valida aparte contra datos reales (ver set_importer_real_test.cpp).

#include "importers/SetImporter.hpp"

#include <matio.h>

#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <vector>

namespace fs = std::filesystem;
using dataminer::core::SignalData;
using dataminer::importers::importSet;

namespace {

matvar_t* createScalarDouble(const char* name, double value) {
    std::size_t dims[2] = {1, 1};
    return Mat_VarCreate(name, MAT_C_DOUBLE, MAT_T_DOUBLE, 2, dims, &value, 0);
}

matvar_t* createCharString(const char* name, const std::string& s) {
    std::size_t dims[2] = {1, s.size()};
    return Mat_VarCreate(name, MAT_C_CHAR, MAT_T_UINT8, 2,
                          dims, const_cast<char*>(s.data()), 0);
}

} // namespace

int main() {
    const std::size_t n_channels = 3;
    const std::size_t n_samples = 5;
    const double srate = 100.0;

    fs::path tmp_dir = fs::temp_directory_path() / "dataminer_fdt_roundtrip_test";
    fs::create_directories(tmp_dir);
    fs::path set_path = tmp_dir / "synthetic.set";
    fs::path fdt_path = tmp_dir / "synthetic.fdt";
    const std::string fdt_name = "synthetic.fdt";

    // Datos crudos en layout MATLAB (canal-mas-rapido / column-major sobre
    // [nbchan, pnts]): elemento (canal, muestra) -> valor = ch*10 + muestra.
    std::vector<float> raw(n_channels * n_samples);
    for (std::size_t sample = 0; sample < n_samples; ++sample) {
        for (std::size_t ch = 0; ch < n_channels; ++ch) {
            raw[sample * n_channels + ch] = static_cast<float>(ch * 10 + sample);
        }
    }
    {
        std::ofstream fdt_file(fdt_path, std::ios::binary);
        fdt_file.write(reinterpret_cast<const char*>(raw.data()),
                        static_cast<std::streamsize>(raw.size() * sizeof(float)));
    }

    // EEGLAB guarda .set con `save(..., '-struct', 'EEG')`: variables de
    // nivel superior individuales, no un struct "EEG" anidado (confirmado
    // contra datos reales — ver comentario en SetImporter.cpp). El fixture
    // sintetico replica exactamente esa forma.
    matvar_t* nbchan_var = createScalarDouble("nbchan", static_cast<double>(n_channels));
    matvar_t* pnts_var = createScalarDouble("pnts", static_cast<double>(n_samples));
    matvar_t* trials_var = createScalarDouble("trials", 1.0);
    matvar_t* srate_var = createScalarDouble("srate", srate);
    matvar_t* data_var = createCharString("data", fdt_name);

    mat_t* matfp = Mat_CreateVer(set_path.string().c_str(), nullptr, MAT_FT_MAT5);
    assert(matfp != nullptr);
    assert(Mat_VarWrite(matfp, nbchan_var, MAT_COMPRESSION_NONE) == 0);
    assert(Mat_VarWrite(matfp, pnts_var, MAT_COMPRESSION_NONE) == 0);
    assert(Mat_VarWrite(matfp, trials_var, MAT_COMPRESSION_NONE) == 0);
    assert(Mat_VarWrite(matfp, srate_var, MAT_COMPRESSION_NONE) == 0);
    assert(Mat_VarWrite(matfp, data_var, MAT_COMPRESSION_NONE) == 0);
    Mat_Close(matfp);

    Mat_VarFree(nbchan_var);
    Mat_VarFree(pnts_var);
    Mat_VarFree(trials_var);
    Mat_VarFree(srate_var);
    Mat_VarFree(data_var);

    // --- Ahora se ejercita el importador real sobre el fixture sintetico ---
    SignalData signal = importSet(set_path.string());

    assert(signal.buffer().nChannels() == n_channels);
    assert(signal.buffer().nSamples() == n_samples);
    assert(signal.metadata().sampling_rate_hz == srate);
    assert(signal.metadata().channels.size() == n_channels);

    for (std::size_t ch = 0; ch < n_channels; ++ch) {
        for (std::size_t sample = 0; sample < n_samples; ++sample) {
            float expected = static_cast<float>(ch * 10 + sample);
            float actual = signal.buffer().at(ch, sample);
            if (actual != expected) {
                std::fprintf(stderr, "Mismatch en (ch=%zu, sample=%zu): esperado %f, obtenido %f\n",
                             ch, sample, expected, actual);
                return 1;
            }
        }
    }

    fs::remove_all(tmp_dir);
    std::printf("set_importer_fdt_roundtrip_test: OK (.fdt externo resuelto y transpuesto "
                "correctamente, %zu canales x %zu muestras)\n", n_channels, n_samples);
    return 0;
}
