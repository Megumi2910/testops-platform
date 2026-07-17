FROM maven:3.9.16-eclipse-temurin-21 AS build

WORKDIR /workspace
COPY pom.xml mvnw mvnw.cmd ./
COPY .mvn .mvn
RUN chmod +x mvnw
COPY src src
RUN ./mvnw -B -DskipTests package

FROM mcr.microsoft.com/playwright/java:v1.60.0-noble

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH=${JAVA_HOME}/bin:${PATH}
COPY --from=build /workspace/target/testops-0.0.1-SNAPSHOT.jar /app/app.jar
RUN mkdir -p /app/artifacts && chown -R pwuser:pwuser /app
USER pwuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
