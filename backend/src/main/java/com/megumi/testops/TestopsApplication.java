package com.megumi.testops;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class TestopsApplication {

    public static void main(String[] args) {
        SpringApplication.run(TestopsApplication.class, args);
    }
}
