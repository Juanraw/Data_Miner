#include "ThreadPool.hpp"

namespace dataminer::executor {

ThreadPool::ThreadPool(std::size_t n_workers) {
    if (n_workers == 0) n_workers = 1;
    workers_.reserve(n_workers);
    for (std::size_t i = 0; i < n_workers; ++i) {
        workers_.emplace_back([this] { workerLoop(); });
    }
}

ThreadPool::~ThreadPool() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stopping_ = true;
    }
    cv_.notify_all();
    for (auto& worker : workers_) {
        if (worker.joinable()) worker.join();
    }
}

void ThreadPool::workerLoop() {
    for (;;) {
        std::function<void()> task;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [this] { return stopping_ || !tasks_.empty(); });
            if (stopping_ && tasks_.empty()) return;
            task = std::move(tasks_.front());
            tasks_.pop();
        }
        task();
    }
}

} // namespace dataminer::executor
