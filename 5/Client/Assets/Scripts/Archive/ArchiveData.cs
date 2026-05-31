using System;
using System.Collections.Generic;
using Shared.Proto;
using UnityEngine;

namespace Client.Archive
{
    [Serializable]
    public class LocalArchiveData
    {
        public string ArchiveName;
        public string ClientId;
        public string SceneId;
        public long SaveTimestamp;
        public List<KVPair> GlobalState = new List<KVPair>();
        public List<EntitySyncData> Entities = new List<EntitySyncData>();
        public SceneStateData SceneState;
    }
}
