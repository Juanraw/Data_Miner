#include "api/HttpServer.hpp"

#include <algorithm>
#include <thread>

int main() {
    const unsigned short port = 8090;
    const std::string data_root = "data/raw";
    const std::string processed_root = "data/processed";
    const std::size_t n_workers = std::max(2u, std::thread::hardware_concurrency());

    dataminer::api::runServer(port, data_root, processed_root, n_workers);
    return 0;
}
