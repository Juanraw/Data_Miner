#include "HttpServer.hpp"

#include "BatchStore.hpp"
#include "DatasetCatalog.hpp"
#include "DatasetStore.hpp"
#include "JsonSerialization.hpp"
#include "Preview.hpp"
#include "SignalExport.hpp"
#include "algorithms/FirFilter.hpp"
#include "executor/ThreadPool.hpp"

#include <boost/asio/ip/tcp.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <nlohmann/json.hpp>

#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>

namespace dataminer::api {

namespace beast = boost::beast;
namespace http = beast::http;
namespace net = boost::asio;
using tcp = net::ip::tcp;
using json = nlohmann::json;

namespace {

std::string readFile(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) return "";
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

std::string mimeType(const std::string& path) {
    if (path.find(".html") != std::string::npos) return "text/html";
    if (path.find(".js") != std::string::npos) return "application/javascript";
    if (path.find(".css") != std::string::npos) return "text/css";
    if (path.find(".png") != std::string::npos) return "image/png";
    if (path.find(".svg") != std::string::npos) return "image/svg+xml";
    if (path.find(".ico") != std::string::npos) return "image/x-icon";
    return "text/plain";
}

std::string percentDecode(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (std::size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '%' && i + 2 < s.size()) {
            int value = 0;
            std::istringstream hex(s.substr(i + 1, 2));
            if (hex >> std::hex >> value) {
                out.push_back(static_cast<char>(value));
                i += 2;
                continue;
            }
        }
        out.push_back(s[i] == '+' ? ' ' : s[i]);
    }
    return out;
}

std::pair<std::string, std::string> splitTarget(const std::string& target) {
    auto pos = target.find('?');
    if (pos == std::string::npos) return {target, ""};
    return {target.substr(0, pos), target.substr(pos + 1)};
}

std::map<std::string, std::string> parseQuery(const std::string& query) {
    std::map<std::string, std::string> params;
    std::size_t start = 0;
    while (start < query.size()) {
        auto amp = query.find('&', start);
        std::string pair = query.substr(start, amp == std::string::npos ? std::string::npos
                                                                          : amp - start);
        auto eq = pair.find('=');
        if (eq != std::string::npos) {
            params[percentDecode(pair.substr(0, eq))] = percentDecode(pair.substr(eq + 1));
        }
        if (amp == std::string::npos) break;
        start = amp + 1;
    }
    return params;
}

// --------------------------------------------------------------
// Conexión: enrutamiento HTTP. El trabajo pesado (importar/filtrar) se
// despacha al ThreadPool y la respuesta se escribe de vuelta posteando al
// executor del socket — nunca bloquea el hilo de red (ADR-004).
// --------------------------------------------------------------
class Connection : public std::enable_shared_from_this<Connection> {
public:
    Connection(tcp::socket socket, DatasetStore& store, executor::ThreadPool& pool, BatchStore& batch,
               std::string processed_root)
        : socket_(std::move(socket)),
          store_(store),
          pool_(pool),
          batch_(batch),
          processed_root_(std::move(processed_root)) {}

    void start() { doRead(); }

private:
    void doRead() {
        auto self = shared_from_this();
        http::async_read(socket_, buffer_, request_, [self](beast::error_code ec, std::size_t) {
            if (ec) {
                std::cerr << "Error leyendo request: " << ec.message() << std::endl;
                return;
            }
            self->route();
        });
    }

    void route() {
        auto [path, query] = splitTarget(std::string(request_.target()));
        auto verb = request_.method();

        if (verb == http::verb::get && path == "/api/datasets") return handleListDatasets();
        if (verb == http::verb::get && path == "/api/import") return handleImport(query);
        if (verb == http::verb::get && path == "/api/preview") return handlePreview(query);
        if (verb == http::verb::post && path == "/api/filter") return handleFilter();
        if (verb == http::verb::post && path == "/api/batch-filter") return handleBatchFilter();
        if (verb == http::verb::get && path == "/api/batch") return handleGetBatch(query);
        if (verb == http::verb::post && path == "/api/save") return handleSave();

        handleStatic(path);
    }

    // --- Handlers síncronos (rápidos: I/O de listado o cómputo O(muestras
    // visibles) sobre datos ya importados) ---

    void handleListDatasets() {
        auto datasets = listDatasets(store_.dataRoot());
        writeJson(datasetsToJson(datasets));
    }

    void handlePreview(const std::string& query) {
        auto params = parseQuery(query);
        auto getStr = [&](const std::string& key, const std::string& def) {
            auto it = params.find(key);
            return it != params.end() ? it->second : def;
        };

        std::string source = getStr("source", "raw");
        std::string key = source == "filtered" ? getStr("filter_id", "") : getStr("id", "");
        if (key.empty()) {
            return writeError(http::status::bad_request, "falta 'id' o 'filter_id'");
        }

        const core::SignalData* signal =
            source == "filtered" ? store_.getFiltered(key) : store_.getImported(key);
        if (!signal) {
            return writeError(http::status::not_found,
                               "dataset/resultado no encontrado (¿lo importaste/filtraste primero?)");
        }

        try {
            std::size_t channel = std::stoul(getStr("channel", "0"));
            std::size_t max_points = std::stoul(getStr("max_points", "2000"));
            std::size_t start_sample = params.count("start") ? std::stoul(params.at("start")) : 0;
            std::size_t end_sample = params.count("end") ? std::stoul(params.at("end"))
                                                           : signal->buffer().nSamples();

            PreviewResult preview =
                decimateChannel(*signal, channel, start_sample, end_sample, max_points);
            writeJson(previewToJson(preview, signal->metadata(), channel));
        } catch (const std::exception& e) {
            writeError(http::status::bad_request, e.what());
        }
    }

    // --- Handlers que despachan al ThreadPool (import/filtrado: I/O +
    // cómputo no trivial) ---

    void handleImport(const std::string& query) {
        auto params = parseQuery(query);
        auto it = params.find("id");
        if (it == params.end()) {
            return writeError(http::status::bad_request, "falta el parámetro 'id'");
        }
        std::string id = it->second;
        auto self = shared_from_this();

        pool_.submit([self, id]() {
            try {
                auto [signal, ms] = self->store_.import(id);
                net::post(self->socket_.get_executor(), [self, signal, ms, id]() {
                    self->writeJson(signalSummaryToJson(id, *signal, ms));
                });
            } catch (const std::exception& e) {
                std::string message = e.what();
                net::post(self->socket_.get_executor(), [self, message]() {
                    self->writeError(http::status::not_found, message);
                });
            }
        });
    }

    void handleFilter() {
        json body;
        try {
            body = json::parse(request_.body());
        } catch (const std::exception&) {
            return writeError(http::status::bad_request, "JSON inválido en el cuerpo");
        }

        FilterRequest req;
        try {
            req.dataset_id = body.at("dataset_id").get<std::string>();
            std::string type = body.at("type").get<std::string>();
            if (type == "lowpass") {
                req.params.type = algorithms::FilterType::LowPass;
            } else if (type == "highpass") {
                req.params.type = algorithms::FilterType::HighPass;
            } else if (type == "bandpass") {
                req.params.type = algorithms::FilterType::BandPass;
            } else {
                return writeError(http::status::bad_request, "'type' debe ser lowpass/highpass/bandpass");
            }
            req.params.low_hz = body.value("low_hz", 0.0);
            req.params.high_hz = body.value("high_hz", 0.0);
            req.params.n_taps = body.value("n_taps", static_cast<std::size_t>(101));
        } catch (const std::exception& e) {
            return writeError(http::status::bad_request,
                               std::string("parámetros inválidos: ") + e.what());
        }

        auto self = shared_from_this();
        pool_.submit([self, req]() {
            try {
                FilterResult result = self->store_.applyFilter(req);
                net::post(self->socket_.get_executor(), [self, result]() {
                    json j;
                    j["filter_id"] = result.filter_id;
                    j["compute_time_ms"] = result.compute_time_ms;
                    self->writeJson(j);
                });
            } catch (const std::exception& e) {
                std::string message = e.what();
                net::post(self->socket_.get_executor(), [self, message]() {
                    self->writeError(http::status::bad_request, message);
                });
            }
        });
    }

    // Tratamiento en masa: cada dataset se importa+filtra en su propio
    // worker del ThreadPool, corriendo en paralelo real (no un loop
    // secuencial) — ver docs/architecture.md, procesamiento masivo.
    void handleBatchFilter() {
        json body;
        try {
            body = json::parse(request_.body());
        } catch (const std::exception&) {
            return writeError(http::status::bad_request, "JSON inválido en el cuerpo");
        }

        std::vector<std::string> dataset_ids;
        algorithms::FirFilterParams params;
        try {
            for (const auto& v : body.at("dataset_ids")) dataset_ids.push_back(v.get<std::string>());
            if (dataset_ids.empty()) {
                return writeError(http::status::bad_request, "'dataset_ids' vacío");
            }
            std::string type = body.at("type").get<std::string>();
            if (type == "lowpass") {
                params.type = algorithms::FilterType::LowPass;
            } else if (type == "highpass") {
                params.type = algorithms::FilterType::HighPass;
            } else if (type == "bandpass") {
                params.type = algorithms::FilterType::BandPass;
            } else {
                return writeError(http::status::bad_request, "'type' debe ser lowpass/highpass/bandpass");
            }
            params.low_hz = body.value("low_hz", 0.0);
            params.high_hz = body.value("high_hz", 0.0);
            params.n_taps = body.value("n_taps", static_cast<std::size_t>(101));
        } catch (const std::exception& e) {
            return writeError(http::status::bad_request,
                               std::string("parámetros inválidos: ") + e.what());
        }

        std::string batch_id = batch_.createBatch(dataset_ids);
        auto self = shared_from_this();

        for (const auto& dataset_id : dataset_ids) {
            pool_.submit([self, batch_id, dataset_id, params]() {
                BatchItem item;
                item.dataset_id = dataset_id;
                item.status = "running";
                self->batch_.updateItem(batch_id, item);
                try {
                    self->store_.import(dataset_id); // ya en caché o se importa ahora
                    FilterResult result = self->store_.applyFilter(FilterRequest{dataset_id, params});
                    item.status = "done";
                    item.filter_id = result.filter_id;
                    item.compute_time_ms = result.compute_time_ms;
                } catch (const std::exception& e) {
                    item.status = "error";
                    item.error = e.what();
                }
                self->batch_.updateItem(batch_id, item);
            });
        }

        writeJson(json{{"batch_id", batch_id}});
    }

    void handleGetBatch(const std::string& query) {
        auto params = parseQuery(query);
        auto it = params.find("id");
        if (it == params.end()) {
            return writeError(http::status::bad_request, "falta 'id'");
        }

        std::vector<BatchItem> items;
        if (!batch_.getBatch(it->second, items)) {
            return writeError(http::status::not_found, "batch no encontrado");
        }

        json arr = json::array();
        bool all_done = true;
        for (const auto& item : items) {
            json j;
            j["dataset_id"] = item.dataset_id;
            j["status"] = item.status;
            if (!item.filter_id.empty()) j["filter_id"] = item.filter_id;
            if (item.compute_time_ms > 0) j["compute_time_ms"] = item.compute_time_ms;
            if (!item.error.empty()) j["error"] = item.error;
            if (item.status == "pending" || item.status == "running") all_done = false;
            arr.push_back(j);
        }
        writeJson(json{{"items", arr}, {"all_done", all_done}});
    }

    // Guarda el resultado actualmente cacheado (raw o filtrado) como
    // checkpoint nativo (ver SignalExport.hpp) — despachado al pool porque
    // escribir el buffer completo a disco no es trivial para datasets grandes.
    void handleSave() {
        json body;
        try {
            body = json::parse(request_.body());
        } catch (const std::exception&) {
            return writeError(http::status::bad_request, "JSON inválido en el cuerpo");
        }

        std::string source = body.value("source", "raw");
        std::string dataset_id, label, filter_id;
        try {
            dataset_id = body.at("dataset_id").get<std::string>();
            if (source == "filtered") {
                filter_id = body.at("filter_id").get<std::string>();
                label = filter_id;
            } else {
                label = "raw";
            }
        } catch (const std::exception& e) {
            return writeError(http::status::bad_request,
                               std::string("parámetros inválidos: ") + e.what());
        }

        const core::SignalData* signal =
            source == "filtered" ? store_.getFiltered(filter_id) : store_.getImported(dataset_id);
        if (!signal) {
            return writeError(http::status::not_found,
                               "resultado no encontrado (¿lo importaste/filtraste primero?)");
        }

        auto self = shared_from_this();
        pool_.submit([self, signal, dataset_id, label]() {
            try {
                SaveResult result = saveSignal(*signal, dataset_id, label, self->processed_root_);
                net::post(self->socket_.get_executor(), [self, result]() {
                    json j;
                    j["dir"] = result.relative_dir;
                    j["bin_file"] = result.bin_filename;
                    j["json_file"] = result.json_filename;
                    self->writeJson(j);
                });
            } catch (const std::exception& e) {
                std::string message = e.what();
                net::post(self->socket_.get_executor(), [self, message]() {
                    self->writeError(http::status::internal_server_error, message);
                });
            }
        });
    }

    // --- Archivos estáticos (build de React) ---

    void handleStatic(std::string path) {
        auto self = shared_from_this();
        if (path == "/") path = "/index.html";
        if (path.find("..") != std::string::npos) {
            return writeError(http::status::bad_request, "ruta inválida");
        }

        std::string body = readFile("public" + path);
        auto response = std::make_shared<http::response<http::string_body>>();
        if (body.empty()) {
            response->result(http::status::not_found);
            response->body() = "404 - Archivo no encontrado: " + path;
            response->set(http::field::content_type, "text/plain");
        } else {
            response->result(http::status::ok);
            response->body() = std::move(body);
            response->set(http::field::content_type, mimeType(path));
        }
        response->prepare_payload();
        http::async_write(socket_, *response, [self, response](beast::error_code ec, std::size_t) {
            if (ec) std::cerr << "Error escribiendo HTTP: " << ec.message() << std::endl;
            self->socket_.shutdown(tcp::socket::shutdown_send);
        });
    }

    // --- Helpers de respuesta ---

    void writeJson(const json& body, http::status status = http::status::ok) {
        auto self = shared_from_this();
        auto response = std::make_shared<http::response<http::string_body>>();
        response->result(status);
        response->set(http::field::content_type, "application/json");
        response->set(http::field::access_control_allow_origin, "*");
        response->body() = body.dump();
        response->prepare_payload();
        http::async_write(socket_, *response, [self, response](beast::error_code ec, std::size_t) {
            if (ec) std::cerr << "Error escribiendo respuesta JSON: " << ec.message() << std::endl;
            self->socket_.shutdown(tcp::socket::shutdown_send);
        });
    }

    void writeError(http::status status, const std::string& message) {
        writeJson(json{{"error", message}}, status);
    }

    tcp::socket socket_;
    beast::flat_buffer buffer_;
    http::request<http::string_body> request_;
    DatasetStore& store_;
    executor::ThreadPool& pool_;
    BatchStore& batch_;
    std::string processed_root_;
};

} // namespace

void runServer(unsigned short port, const std::string& data_root, const std::string& processed_root,
               std::size_t n_workers) {
    DatasetStore store(data_root);
    executor::ThreadPool pool(n_workers);
    BatchStore batch;

    try {
        net::io_context ioc(1);
        tcp::acceptor acceptor(ioc, tcp::endpoint(tcp::v4(), port));

        std::cout << "Servidor corriendo en http://0.0.0.0:" << port << " (data_root=" << data_root
                  << ", processed_root=" << processed_root << ", workers=" << n_workers << ")"
                  << std::endl;

        std::function<void()> acceptLoop;
        acceptLoop = [&]() {
            acceptor.async_accept([&](beast::error_code ec, tcp::socket socket) {
                if (!ec) {
                    std::make_shared<Connection>(std::move(socket), store, pool, batch, processed_root)
                        ->start();
                } else {
                    std::cerr << "Error aceptando conexión: " << ec.message() << std::endl;
                }
                acceptLoop();
            });
        };
        acceptLoop();

        ioc.run();
    } catch (const std::exception& e) {
        std::cerr << "Excepción en runServer: " << e.what() << std::endl;
    }
}

} // namespace dataminer::api
