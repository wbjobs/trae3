package com.research.sample.storage.service;

import java.io.InputStream;

public interface StorageService {

    String uploadFile(String objectName, InputStream inputStream, String contentType);

    InputStream downloadFile(String objectName);

    void deleteFile(String objectName);

    String getPresignedUrl(String objectName, int expirationMinutes);
}
