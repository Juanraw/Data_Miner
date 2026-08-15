#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <memory>
#include <functional>

namespace beast = boost::beast;
namespace http = beast::http;
namespace websocket = beast::websocket;
namespace net = boost::asio;
using tcp = net::ip::tcp;

// Funciones auxiliares
std::string leer_archivo(const std::string& ruta) {
    std::ifstream archivo(ruta, std::ios::binary);
    if (!archivo.is_open()) return "";
    std::stringstream buffer;
    buffer << archivo.rdbuf();
    return buffer.str();
}

std::string mime_type(const std::string& ruta) {
    if (ruta.find(".html") != std::string::npos) return "text/html";
    if (ruta.find(".js") != std::string::npos)   return "application/javascript";
    if (ruta.find(".css") != std::string::npos)  return "text/css";
    if (ruta.find(".png") != std::string::npos)  return "image/png";
    if (ruta.find(".svg") != std::string::npos)  return "image/svg+xml";
    if (ruta.find(".ico") != std::string::npos)  return "image/x-icon";
    return "text/plain";
}

// --------------------------------------------------------------
// Clase que maneja una conexión (HTTP o WebSocket)
// --------------------------------------------------------------
class Connection : public std::enable_shared_from_this<Connection> {
public:
    Connection(tcp::socket socket) : socket_(std::move(socket)) {}

    void start() {
        do_read();
    }

private:
    void do_read() {
        auto self = shared_from_this();
        http::async_read(socket_, buffer_, request_,
            [self](beast::error_code ec, std::size_t) {
                if (ec) {
                    std::cerr << "❌ Error leyendo request: " << ec.message() << std::endl;
                    return;
                }
                if (websocket::is_upgrade(self->request_) && self->request_.target() == "/ws") {
                    self->handle_websocket();
                } else {
                    self->handle_http();
                }
            });
    }

    void handle_http() {
        auto self = shared_from_this();
        std::string target = request_.target().to_string();
        if (target == "/") target = "/index.html";

        std::string filepath = "public" + target;
        std::string body = leer_archivo(filepath);

        http::response<http::string_body> response;
        if (body.empty()) {
            response.result(http::status::not_found);
            response.body() = "404 - Archivo no encontrado: " + target;
            response.set(http::field::content_type, "text/plain");
        } else {
            response.result(http::status::ok);
            response.body() = body;
            response.set(http::field::content_type, mime_type(target));
        }
        response.prepare_payload();

        http::async_write(socket_, response,
            [self](beast::error_code ec, std::size_t) {
                if (ec) std::cerr << "❌ Error escribiendo HTTP: " << ec.message() << std::endl;
                self->socket_.shutdown(tcp::socket::shutdown_send);
            });
    }

    void handle_websocket() {
        auto self = shared_from_this();
        std::cout << "🔍 Solicitud WebSocket en /ws" << std::endl;

        ws_ = std::make_shared<websocket::stream<tcp::socket>>(std::move(socket_));

        ws_->async_accept(request_,
            [self](beast::error_code ec) {
                if (ec) {
                    std::cerr << "❌ Error al aceptar WebSocket: " << ec.message() << std::endl;
                    return;
                }
                std::cout << "✅ WebSocket aceptado correctamente" << std::endl;
                std::cout << "🟢 Cliente WebSocket conectado" << std::endl;
                self->read_websocket();
            });
    }

    void read_websocket() {
        auto self = shared_from_this();
        ws_->async_read(buffer_ws_,
            [self](beast::error_code ec, std::size_t bytes) {
                if (ec) {
                    if (ec == websocket::error::closed) {
                        std::cout << "🔴 Cliente WebSocket desconectado (cerrado)" << std::endl;
                    } else {
                        std::cerr << "❌ Error leyendo WebSocket: " << ec.message() << std::endl;
                    }
                    return;
                }
                bool binario = self->ws_->got_binary();
                std::string datos = beast::buffers_to_string(self->buffer_ws_.data());
                self->buffer_ws_.consume(bytes);

                if (binario) {
                    std::cout << "⚡ Recibidos " << datos.size() << " bytes binarios" << std::endl;
                    for (char& c : datos) c = ~c;
                    self->ws_->async_write(
                        net::buffer(datos),
                        [self](beast::error_code ec, std::size_t) {
                            if (!ec) self->read_websocket();
                        });
                } else {
                    std::cout << "💬 Mensaje de texto: " << datos << std::endl;
                    self->ws_->async_write(
                        net::buffer("¡Hola desde C++!"),
                        [self](beast::error_code ec, std::size_t) {
                            if (!ec) self->read_websocket();
                        });
                }
            });
    }

    tcp::socket socket_;
    beast::flat_buffer buffer_;
    http::request<http::string_body> request_;
    std::shared_ptr<websocket::stream<tcp::socket>> ws_;
    beast::flat_buffer buffer_ws_;
};

// --------------------------------------------------------------
// Servidor principal
// --------------------------------------------------------------
int main() {
    try {
        net::io_context ioc(1);
        tcp::acceptor acceptor(ioc, tcp::endpoint(tcp::v4(), 8090));

        std::cout << "✅ Servidor HTTP/WebSocket corriendo en http://0.0.0.0:8090" << std::endl;

        std::function<void()> accept_loop;
        accept_loop = [&]() {
            acceptor.async_accept(
                [&](beast::error_code ec, tcp::socket socket) {
                    if (!ec) {
                        std::make_shared<Connection>(std::move(socket))->start();
                    } else {
                        std::cerr << "❌ Error aceptando conexión: " << ec.message() << std::endl;
                    }
                    accept_loop();
                });
        };
        accept_loop();

        ioc.run();
    } catch (std::exception& e) {
        std::cerr << "❌ Excepción en main: " << e.what() << std::endl;
        return 1;
    }
    return 0;
}