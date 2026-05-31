package com.specimen.data.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.common.context.TenantContext;
import com.specimen.common.enums.AnnotationTypeEnum;
import com.specimen.common.exception.BusinessException;
import com.specimen.data.dto.AnnotationCreateDTO;
import com.specimen.data.dto.AnnotationBatchCreateDTO;
import com.specimen.data.dto.AnnotationQueryDTO;
import com.specimen.data.entity.SpecimenAnnotation;
import com.specimen.data.mapper.SpecimenAnnotationMapper;
import com.specimen.data.service.SpecimenAnnotationService;
import com.specimen.data.vo.AnnotationVO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SpecimenAnnotationServiceImpl implements SpecimenAnnotationService {
    private final SpecimenAnnotationMapper annotationMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AnnotationVO create(AnnotationCreateDTO dto) {
        SpecimenAnnotation annotation = new SpecimenAnnotation();
        BeanUtils.copyProperties(dto, annotation);
        annotation.setTenantId(TenantContext.getTenantId());
        annotation.setAnnotatorId(TenantContext.getUserId());
        annotation.setAnnotatorName(TenantContext.getUsername());
        annotation.setAnnotationTime(LocalDateTime.now());
        annotation.setStatus(1);
        annotationMapper.insert(annotation);
        return getById(annotation.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<AnnotationVO> batchCreate(AnnotationBatchCreateDTO dto) {
        if (dto.getAnnotations() == null || dto.getAnnotations().isEmpty()) {
            throw new BusinessException("标注数据不能为空");
        }

        LocalDateTime now = LocalDateTime.now();
        Long userId = TenantContext.getUserId();
        String username = TenantContext.getUsername();
        Long tenantId = TenantContext.getTenantId();

        for (AnnotationCreateDTO annotationDTO : dto.getAnnotations()) {
            SpecimenAnnotation annotation = new SpecimenAnnotation();
            BeanUtils.copyProperties(annotationDTO, annotation);
            annotation.setSpecimenId(dto.getSpecimenId());
            annotation.setImageId(dto.getImageId());
            annotation.setTenantId(tenantId);
            annotation.setAnnotatorId(userId);
            annotation.setAnnotatorName(username);
            annotation.setAnnotationTime(now);
            annotation.setStatus(1);
            annotationMapper.insert(annotation);
        }

        return listByImageId(dto.getImageId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        SpecimenAnnotation annotation = annotationMapper.selectById(id);
        if (annotation == null) {
            throw new BusinessException("标注不存在");
        }
        annotationMapper.deleteById(id);
    }

    @Override
    public AnnotationVO getById(Long id) {
        SpecimenAnnotation annotation = annotationMapper.selectById(id);
        if (annotation == null) {
            throw new BusinessException("标注不存在");
        }
        return convertToVO(annotation);
    }

    @Override
    public Page<AnnotationVO> page(AnnotationQueryDTO dto) {
        Page<SpecimenAnnotation> pageParam = new Page<>(dto.getPage(), dto.getSize());
        LambdaQueryWrapper<SpecimenAnnotation> wrapper = new LambdaQueryWrapper<>();

        if (dto.getSpecimenId() != null) {
            wrapper.eq(SpecimenAnnotation::getSpecimenId, dto.getSpecimenId());
        }
        if (dto.getImageId() != null) {
            wrapper.eq(SpecimenAnnotation::getImageId, dto.getImageId());
        }
        if (dto.getAnnotationType() != null) {
            wrapper.eq(SpecimenAnnotation::getAnnotationType, dto.getAnnotationType());
        }
        if (dto.getLabel() != null && !dto.getLabel().isEmpty()) {
            wrapper.like(SpecimenAnnotation::getLabel, dto.getLabel());
        }
        if (dto.getStatus() != null) {
            wrapper.eq(SpecimenAnnotation::getStatus, dto.getStatus());
        }
        if (dto.getAnnotatorId() != null) {
            wrapper.eq(SpecimenAnnotation::getAnnotatorId, dto.getAnnotatorId());
        }

        wrapper.orderByDesc(SpecimenAnnotation::getAnnotationTime);
        Page<SpecimenAnnotation> pageResult = annotationMapper.selectPage(pageParam, wrapper);

        Page<AnnotationVO> result = new Page<>(pageResult.getCurrent(), pageResult.getSize(), pageResult.getTotal());
        result.setRecords(pageResult.getRecords().stream()
                .map(this::convertToVO)
                .collect(Collectors.toList()));
        return result;
    }

    @Override
    public List<AnnotationVO> listByImageId(Long imageId) {
        LambdaQueryWrapper<SpecimenAnnotation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SpecimenAnnotation::getImageId, imageId);
        wrapper.orderByDesc(SpecimenAnnotation::getAnnotationTime);
        List<SpecimenAnnotation> annotations = annotationMapper.selectList(wrapper);

        return annotations.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    @Override
    public List<AnnotationVO> listBySpecimenIds(List<Long> specimenIds) {
        if (specimenIds == null || specimenIds.isEmpty()) {
            return new ArrayList<>();
        }
        LambdaQueryWrapper<SpecimenAnnotation> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(SpecimenAnnotation::getSpecimenId, specimenIds);
        wrapper.orderByDesc(SpecimenAnnotation::getAnnotationTime);
        List<SpecimenAnnotation> annotations = annotationMapper.selectList(wrapper);

        return annotations.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    private AnnotationVO convertToVO(SpecimenAnnotation annotation) {
        AnnotationVO vo = new AnnotationVO();
        BeanUtils.copyProperties(annotation, vo);

        for (AnnotationTypeEnum type : AnnotationTypeEnum.values()) {
            if (type.getCode().equals(annotation.getAnnotationType())) {
                vo.setAnnotationTypeName(type.getName());
                break;
            }
        }

        return vo;
    }
}
