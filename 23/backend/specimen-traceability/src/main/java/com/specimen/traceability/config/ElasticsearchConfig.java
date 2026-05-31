package com.specimen.traceability.config;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.ElasticsearchTransport;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ElasticsearchConfig {

    @Value("${spring.elasticsearch.uris}")
    private String uris;

    @Value("${spring.elasticsearch.username:}")
    private String username;

    @Value("${spring.elasticsearch.password:}")
    private String password;

    @Bean
    public ElasticsearchClient elasticsearchClient() {
        String[] uriArray = uris.split(",");
        HttpHost[] httpHosts = new HttpHost[uriArray.length];
        for (int i = 0; i < uriArray.length; i++) {
            String uri = uriArray[i].replace("http://", "").replace("https://", "");
            String[] hostPort = uri.split(":");
            httpHosts[i] = new HttpHost(hostPort[0], Integer.parseInt(hostPort[1]), "http");
        }

        RestClient restClient = RestClient.builder(httpHosts).build();
        ElasticsearchTransport transport = new RestClientTransport(
                restClient, new JacksonJsonpMapper());
        return new ElasticsearchClient(transport);
    }
}
