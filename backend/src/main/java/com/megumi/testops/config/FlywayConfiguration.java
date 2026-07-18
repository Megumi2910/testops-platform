package com.megumi.testops.config;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
public class FlywayConfiguration {

    @Bean(name = "flyway")
    Flyway flyway(DataSource dataSource,
            @Value("${spring.flyway.locations:classpath:db/migration}") String locationProperty) {
        String[] locations = StringUtils.commaDelimitedListToStringArray(locationProperty);
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations(locations)
                .cleanDisabled(true)
                .load();
        flyway.migrate();
        return flyway;
    }

    @Bean
    static BeanFactoryPostProcessor entityManagerWaitsForFlyway() {
        return beanFactory -> {
            if (beanFactory instanceof BeanDefinitionRegistry registry
                    && registry.containsBeanDefinition("entityManagerFactory")) {
                registry.getBeanDefinition("entityManagerFactory").setDependsOn("flyway");
            }
        };
    }
}
