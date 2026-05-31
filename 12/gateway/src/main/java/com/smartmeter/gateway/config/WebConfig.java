package com.smartmeter.gateway.config;

import com.alibaba.fastjson.serializer.SerializeConfig;
import com.alibaba.fastjson.serializer.SerializeFilter;
import com.alibaba.fastjson.serializer.ValueFilter;
import com.alibaba.fastjson.support.config.FastJsonConfig;
import com.alibaba.fastjson.support.spring.FastJsonHttpMessageConverter;
import com.smartmeter.gateway.filter.AuthFilter;
import com.smartmeter.gateway.filter.RateLimitFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private AuthFilter authFilter;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(rateLimitFilter)
                .addPathPatterns("/api/**")
                .order(1);

        registry.addInterceptor(authFilter)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/login", "/actuator/**")
                .order(2);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        StringRedisSerializer stringSerializer = new StringRedisSerializer();
        com.alibaba.fastjson.support.spring.GenericFastJsonRedisSerializer fastJsonSerializer =
                new com.alibaba.fastjson.support.spring.GenericFastJsonRedisSerializer();

        template.setKeySerializer(stringSerializer);
        template.setHashKeySerializer(stringSerializer);
        template.setValueSerializer(fastJsonSerializer);
        template.setHashValueSerializer(fastJsonSerializer);
        template.afterPropertiesSet();

        return template;
    }

    @Bean
    public FilterRegistrationBean<GzipFilter> gzipFilter() {
        FilterRegistrationBean<GzipFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new GzipFilter());
        registration.addUrlPatterns("/api/*");
        registration.setName("gzipFilter");
        registration.setOrder(3);
        return registration;
    }

    public static class GzipFilter extends OncePerRequestFilter {

        private static final int MIN_GZIP_SIZE = 512;

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                        FilterChain filterChain) throws ServletException, IOException {
            String acceptEncoding = request.getHeader("Accept-Encoding");
            if (acceptEncoding != null && acceptEncoding.contains("gzip")) {
                GzipHttpServletResponseWrapper wrappedResponse = new GzipHttpServletResponseWrapper(response);
                try {
                    filterChain.doFilter(request, wrappedResponse);
                } finally {
                    wrappedResponse.finish();
                }
            } else {
                filterChain.doFilter(request, response);
            }
        }
    }

    public static class GzipHttpServletResponseWrapper extends HttpServletResponseWrapper {
        private final HttpServletResponse originalResponse;
        private GzipServletOutputStream gzipOutputStream;
        private java.util.zip.GZIPOutputStream gzipStream;

        public GzipHttpServletResponseWrapper(HttpServletResponse response) {
            super(response);
            this.originalResponse = response;
        }

        @Override
        public ServletOutputStream getOutputStream() throws IOException {
            if (gzipOutputStream == null) {
                originalResponse.setHeader("Content-Encoding", "gzip");
                gzipStream = new java.util.zip.GZIPOutputStream(originalResponse.getOutputStream());
                gzipOutputStream = new GzipServletOutputStream(gzipStream);
            }
            return gzipOutputStream;
        }

        @Override
        public java.io.PrintWriter getWriter() throws IOException {
            return new java.io.PrintWriter(new java.io.OutputStreamWriter(getOutputStream(), "UTF-8"));
        }

        public void finish() throws IOException {
            if (gzipStream != null) {
                gzipStream.finish();
                gzipStream.close();
            }
        }
    }

    public static class GzipServletOutputStream extends ServletOutputStream {
        private final java.util.zip.GZIPOutputStream gzipStream;

        public GzipServletOutputStream(java.util.zip.GZIPOutputStream gzipStream) {
            this.gzipStream = gzipStream;
        }

        @Override
        public void write(int b) throws IOException {
            gzipStream.write(b);
        }

        @Override
        public void write(byte[] b) throws IOException {
            gzipStream.write(b);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            gzipStream.write(b, off, len);
        }

        @Override
        public void flush() throws IOException {
            gzipStream.flush();
        }

        @Override
        public void close() throws IOException {
            gzipStream.close();
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setWriteListener(WriteListener writeListener) {
        }
    }
}
