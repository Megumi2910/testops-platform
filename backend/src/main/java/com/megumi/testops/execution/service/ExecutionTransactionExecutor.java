package com.megumi.testops.execution.service;

import java.util.function.Supplier;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates an explicit transaction boundary for each worker state transition.
 * Keeping this in a separate proxied component avoids ineffective
 * self-invocation of {@code @Transactional} methods in the run loop.
 */
@Component
public class ExecutionTransactionExecutor {
    @Transactional
    public <T> T required(Supplier<T> work) {
        return work.get();
    }

    @Transactional
    public void required(Runnable work) {
        work.run();
    }
}
