FROM openjdk:17-jdk-slim

LABEL maintainer="railway-system"
LABEL description="Train Status Report API Cluster Service"

ENV TZ=Asia/Shanghai
ENV JAVA_OPTS="-Xms512m -Xmx2048m"
ENV SERVER_PORT=8080

WORKDIR /app

COPY train-status-service/target/train-status-service-1.0.0.jar app.jar

RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -Djava.security.egd=file:/dev/./urandom -jar app.jar"]
