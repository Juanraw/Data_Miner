// Valida ThreadPool: (a) correctitud de resultados vía futures, (b)
// concurrencia real (no solo una cola disfrazada de secuencial) — N tareas
// que duermen se completan en mucho menos que N * duración si de verdad
// corren en paralelo. Margen amplio para evitar falsos negativos por carga
// del entorno de build.

#include "executor/ThreadPool.hpp"

#include <cassert>
#include <chrono>
#include <cstdio>
#include <thread>
#include <vector>

using dataminer::executor::ThreadPool;

int main() {
    // --- Correctitud ---
    {
        ThreadPool pool(4);
        std::vector<std::future<int>> futures;
        for (int i = 0; i < 8; ++i) {
            futures.push_back(pool.submit([i] { return i * i; }));
        }
        for (int i = 0; i < 8; ++i) {
            assert(futures[static_cast<std::size_t>(i)].get() == i * i);
        }
    }

    // --- Concurrencia real ---
    {
        ThreadPool pool(4);
        const auto sleep_ms = std::chrono::milliseconds(100);
        auto start = std::chrono::steady_clock::now();

        std::vector<std::future<void>> futures;
        for (int i = 0; i < 4; ++i) {
            futures.push_back(pool.submit([sleep_ms] { std::this_thread::sleep_for(sleep_ms); }));
        }
        for (auto& f : futures) f.get();

        auto elapsed = std::chrono::steady_clock::now() - start;
        auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();

        std::printf("4 tareas de 100ms en pool de 4 workers: %lldms (secuencial serian ~400ms)\n",
                    static_cast<long long>(elapsed_ms));
        // Umbral amplio: si corrieran secuencialmente tomarian ~400ms; en
        // paralelo real deberian tomar ~100-150ms incluso con overhead.
        assert(elapsed_ms < 350);
    }

    std::printf("threadpool_test: OK\n");
    return 0;
}
