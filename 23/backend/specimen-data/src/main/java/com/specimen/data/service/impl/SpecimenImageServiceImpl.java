package com.specimen.data.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.specimen.common.exception.BusinessException;
import com.specimen.common.result.Result;
import com.specimen.data.entity.SpecimenImage;
import com.specimen.data.feign.StorageClient;
import com.specimen.data.mapper.SpecimenImageMapper;
import com.specimen.data.service.SpecimenImageService;
import com.specimen.data.vo.SpecimenImageVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SpecimenImageServiceImpl implements SpecimenImageService {
    private final SpecimenImageMapper specimenImageMapper;
    private final StorageClient storageClient;
    private final StringRedisTemplate redisTemplate;

    private static final String PREVIEW_URL_CACHE_PREFIX = "preview:url:";
    private static final long PREVIEW_URL_CACHE_SECONDS = 3000;

    @Override
    public List<SpecimenImageVO> listBySpecimenId(Long specimenId) {
        LambdaQueryWrapper<SpecimenImage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SpecimenImage::getSpecimenId, specimenId);
        wrapper.orderByAsc(SpecimenImage::getSort);
        List<SpecimenImage> images = specimenImageMapper.selectList(wrapper);

        return images.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    @Override
    public List<SpecimenImageVO> listBySpecimenIds(List<Long> specimenIds) {
        if (specimenIds == null || specimenIds.isEmpty()) {
            return List.of();
        }
        LambdaQueryWrapper<SpecimenImage> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(SpecimenImage::getSpecimenId, specimenIds);
        wrapper.orderByAsc(SpecimenImage::getSort);
        List<SpecimenImage> images = specimenImageMapper.selectList(wrapper);

        return images.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SpecimenImageVO add(SpecimenImage image) {
        specimenImageMapper.insert(image);
        return convertToVO(image);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        SpecimenImage image = specimenImageMapper.selectById(id);
        if (image == null) {
            throw new BusinessException("图片不存在");
        }
        specimenImageMapper.deleteById(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteBySpecimenId(Long specimenId) {
        LambdaQueryWrapper<SpecimenImage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SpecimenImage::getSpecimenId, specimenId);
        specimenImageMapper.delete(wrapper);
    }

    private SpecimenImageVO convertToVO(SpecimenImage image) {
        SpecimenImageVO vo = new SpecimenImageVO();
        BeanUtils.copyProperties(image, vo);

        if (image.getImageType() != null) {
            switch (image.getImageType()) {
                case 1: vo.setImageTypeName("原图"); break;
                case 2: vo.setImageTypeName("缩略图"); break;
                case 3: vo.setImageTypeName("标注图"); break;
                default: vo.setImageTypeName("未知");
            }
        }

        String previewUrl = resolvePreviewUrl(image);
        if (previewUrl != null) {
            vo.setPreviewUrl(previewUrl);
            vo.setImageUrl(previewUrl);
        }

        return vo;
    }

    private String resolvePreviewUrl(SpecimenImage image) {
        if (image.getObjectName() != null && !image.getObjectName().isEmpty()) {
            return getCachedPreviewUrl(image.getObjectName());
        }

        if (image.getFileId() != null) {
            try {
                String objectName = getCachedObjectName(image.getFileId());
                if (objectName != null) {
                    return getCachedPreviewUrl(objectName);
                }
            } catch (Exception e) {
                log.warn("Failed to resolve preview URL for image {}: {}", image.getId(), e.getMessage());
            }
        }

        return image.getImageUrl();
    }

    private String getCachedPreviewUrl(String objectName) {
        String cacheKey = PREVIEW_URL_CACHE_PREFIX + objectName;
        String cachedUrl = redisTemplate.opsForValue().get(cacheKey);
        if (cachedUrl != null) {
            return cachedUrl;
        }

        try {
            Result<String> result = storageClient.preview(objectName, 3600);
            if (result != null && result.getData() != null) {
                redisTemplate.opsForValue().set(cacheKey, result.getData(), PREVIEW_URL_CACHE_SECONDS, TimeUnit.SECONDS);
                return result.getData();
            }
        } catch (Exception e) {
            log.warn("Failed to get preview URL for {}: {}", objectName, e.getMessage());
        }
        return null;
    }

    private String getCachedObjectName(Long fileId) {
        String cacheKey = "file:objectName:" + fileId;
        String cachedName = redisTemplate.opsForValue().get(cacheKey);
        if (cachedName != null) {
            return cachedName;
        }

        try {
            Result<Map<String, Object>> fileResult = storageClient.getFileInfo(fileId);
            if (fileResult != null && fileResult.getData() != null) {
                String objectName = (String) fileResult.getData().get("objectName");
                if (objectName != null) {
                    redisTemplate.opsForValue().set(cacheKey, objectName, PREVIEW_URL_CACHE_SECONDS, TimeUnit.SECONDS);
                    return objectName;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to get file info for {}: {}", fileId, e.getMessage());
        }
        return null;
    }
}
