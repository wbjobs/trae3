package com.specimen.storage.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.specimen.storage.entity.StorageFile;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface StorageFileMapper extends BaseMapper<StorageFile> {
}
