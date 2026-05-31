package com.specimen.data.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.specimen.data.entity.Specimen;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SpecimenMapper extends BaseMapper<Specimen> {
}
