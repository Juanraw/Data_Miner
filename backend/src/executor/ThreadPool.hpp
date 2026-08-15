#pragma once

#include <condition_variable>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <queue>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <vector>

namespace dataminer::executor {

// Pool de workers para cómputo pesado (filtros, ICA, ASR, un sujeto por
// tarea), en un dominio de concurrencia separado del io_context de red de
// api/ (ver docs/adr/004-concurrency-model.md). No conoce Boost.Asio/Beast
// ni ningún tipo de algoritmos/ — solo ejecuta callables.
class ThreadPool {
public:
    explicit ThreadPool(std::size_t n_workers);
    ~ThreadPool();

    ThreadPool(const ThreadPool&) = delete;
    ThreadPool& operator=(const ThreadPool&) = delete;

    template <typename F, typename R = std::invoke_result_t<F>>
    std::future<R> submit(F task) {
        auto packaged = std::make_shared<std::packaged_task<R()>>(std::move(task));
        std::future<R> result = packaged->get_future();
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (stopping_) {
                throw std::runtime_error("ThreadPool: submit() después de iniciar el cierre");
            }
            tasks_.emplace([packaged]() { (*packaged)(); });
        }
        cv_.notify_one();
        return result;
    }

    std::size_t nWorkers() const noexcept { return workers_.size(); }

private:
    void workerLoop();

    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> tasks_;
    std::mutex mutex_;
    std::condition_variable cv_;
    bool stopping_ = false;
};

} // namespace dataminer::executor
