package com.specimen.data.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.specimen.common.context.TenantContext;
import com.specimen.common.exception.BusinessException;
import com.specimen.data.entity.SpecimenTag;
import com.specimen.data.mapper.SpecimenTagMapper;
import com.specimen.data.service.SpecimenTagService;
import com.specimen.data.vo.SpecimenTagVO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SpecimenTagServiceImpl implements SpecimenTagService {
    private final SpecimenTagMapper tagMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SpecimenTagVO create(SpecimenTag tag) {
        tag.setTenantId(TenantContext.getTenantId());
        tag.setCount(0);
        tagMapper.insert(tag);
        return getById(tag.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SpecimenTagVO update(SpecimenTag tag) {
        SpecimenTag existTag = tagMapper.selectById(tag.getId());
        if (existTag == null) {
            throw new BusinessException("标签不存在");
        }
        tag.setCount(existTag.getCount());
        tagMapper.updateById(tag);
        return getById(tag.getId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        SpecimenTag tag = tagMapper.selectById(id);
        if (tag == null) {
            throw new BusinessException("标签不存在");
        }
        tagMapper.deleteById(id);
    }

    @Override
    public SpecimenTagVO getById(Long id) {
        SpecimenTag tag = tagMapper.selectById(id);
        if (tag == null) {
            throw new BusinessException("标签不存在");
        }
        return convertToVO(tag);
    }

    @Override
    public List<SpecimenTagVO> list() {
        LambdaQueryWrapper<SpecimenTag> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(SpecimenTag::getCount);
        List<SpecimenTag> tags = tagMapper.selectList(wrapper);
        return tags.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    @Override
    public Page<SpecimenTagVO> page(Integer page, Integer size, String keyword) {
        Page<SpecimenTag> pageParam = new Page<>(page, size);
        LambdaQueryWrapper<SpecimenTag> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isEmpty()) {
            wrapper.like(SpecimenTag::getName, keyword);
        }
        wrapper.orderByDesc(SpecimenTag::getCount);
        Page<SpecimenTag> pageResult = tagMapper.selectPage(pageParam, wrapper);

        Page<SpecimenTagVO> result = new Page<>(pageResult.getCurrent(), pageResult.getSize(), pageResult.getTotal());
        result.setRecords(pageResult.getRecords().stream()
                .map(this::convertToVO)
                .collect(Collectors.toList()));
        return result;
    }

    private SpecimenTagVO convertToVO(SpecimenTag tag) {
        SpecimenTagVO vo = new SpecimenTagVO();
        BeanUtils.copyProperties(tag, vo);
        return vo;
    }
}
