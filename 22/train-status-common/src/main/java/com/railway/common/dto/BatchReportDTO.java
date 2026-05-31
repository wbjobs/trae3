package com.railway.common.dto;

import java.io.Serializable;
import java.util.List;

public class BatchReportDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private List<TrainStatusReportDTO> reports;

    private boolean compressed;

    public List<TrainStatusReportDTO> getReports() {
        return reports;
    }

    public void setReports(List<TrainStatusReportDTO> reports) {
        this.reports = reports;
    }

    public boolean isCompressed() {
        return compressed;
    }

    public void setCompressed(boolean compressed) {
        this.compressed = compressed;
    }

    public int size() {
        return reports != null ? reports.size() : 0;
    }
}
