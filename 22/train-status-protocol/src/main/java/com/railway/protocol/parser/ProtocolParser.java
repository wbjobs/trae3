package com.railway.protocol.parser;

import com.railway.common.entity.TrainStatus;
import com.railway.protocol.model.ProtocolFrame;

public interface ProtocolParser {

    int getSupportedVersion();

    ProtocolFrame parseFrame(byte[] data);

    TrainStatus parseTrainStatus(ProtocolFrame frame);

    boolean validateFrame(ProtocolFrame frame);
}
