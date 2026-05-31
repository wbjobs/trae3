package com.ancient.platform.search.dto;

import com.ancient.platform.project.entity.AncientPage;
import lombok.Data;

import java.util.List;

@Data
public class AsyncIndexRequest {

    private AncientPage page;

    private List<AncientPage> pages;

    private String projectName;
}
