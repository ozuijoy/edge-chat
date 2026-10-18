package com.aozorae.edgechat.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.aozorae.edgechat.core.repository.OutboxRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

@HiltWorker
class OutboxWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted parameters: WorkerParameters,
    private val outbox: OutboxRepository,
) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        outbox.recoverInterrupted()
        repeat(10) {
            if (!outbox.hasPending()) return Result.success()
            if (!outbox.processNext()) return if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
        return if (outbox.hasPending()) Result.retry() else Result.success()
    }
}
