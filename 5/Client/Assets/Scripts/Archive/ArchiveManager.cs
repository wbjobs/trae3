using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Threading.Tasks;
using Shared.Common;
using Shared.Proto;
using UnityEngine;

namespace Client.Archive
{
    public class ArchiveManager : MonoBehaviour
    {
        private string _localArchiveDir;
        private readonly object _fileLock = new object();

        public event Action<string> OnArchiveSaved;
        public event Action<string> OnArchiveLoaded;
        public event Action<List<string>> OnArchiveListUpdated;

        private void Awake()
        {
            _localArchiveDir = Path.Combine(Application.persistentDataPath, Constants.ArchiveDirectory);
            Directory.CreateDirectory(_localArchiveDir);
        }

        public async void SaveLocalArchiveAsync(LocalArchiveData data)
        {
            await Task.Run(() => SaveLocalArchive(data));
        }

        public void SaveLocalArchive(LocalArchiveData data)
        {
            try
            {
                lock (_fileLock)
                {
                    data.SaveTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    var path = GetLocalPath(data.ClientId, data.ArchiveName);
                    var dir = Path.GetDirectoryName(path);
                    Directory.CreateDirectory(dir);

                    var json = JsonUtility.ToJson(data, false);
                    var bytes = Encoding.UTF8.GetBytes(json);

                    using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 4096, false);
                    using var gzip = new GZipStream(fs, CompressionLevel.Optimal);
                    gzip.Write(bytes, 0, bytes.Length);
                }
                OnArchiveSaved?.Invoke(data.ArchiveName);
                Debug.Log($"[Archive] Local save: {data.ArchiveName}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[Archive] Local save error: {ex.Message}");
            }
        }

        public async void LoadLocalArchiveAsync(string clientId, string archiveName, Action<LocalArchiveData> callback)
        {
            var result = await Task.Run(() => LoadLocalArchive(clientId, archiveName));
            callback?.Invoke(result);
        }

        public LocalArchiveData LoadLocalArchive(string clientId, string archiveName)
        {
            try
            {
                lock (_fileLock)
                {
                    var path = GetLocalPath(clientId, archiveName);
                    if (!File.Exists(path))
                    {
                        Debug.LogWarning($"[Archive] Not found: {archiveName}");
                        return null;
                    }

                    using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, false);
                    using var gzip = new GZipStream(fs, CompressionMode.Decompress);
                    using var ms = new MemoryStream();
                    gzip.CopyTo(ms);

                    var json = Encoding.UTF8.GetString(ms.ToArray());
                    var data = JsonUtility.FromJson<LocalArchiveData>(json);
                    OnArchiveLoaded?.Invoke(archiveName);
                    Debug.Log($"[Archive] Local load: {archiveName}");
                    return data;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"[Archive] Local load error: {ex.Message}");
                return null;
            }
        }

        public List<string> ListLocalArchives(string clientId)
        {
            var clientDir = Path.Combine(_localArchiveDir, Sanitize(clientId));
            if (!Directory.Exists(clientDir))
                return new List<string>();

            var files = Directory.GetFiles(clientDir, "*" + Constants.ArchiveExtension);
            var result = new List<string>();
            foreach (var f in files)
                result.Add(Path.GetFileNameWithoutExtension(f));
            OnArchiveListUpdated?.Invoke(result);
            return result;
        }

        public void DeleteLocalArchive(string clientId, string archiveName)
        {
            var path = GetLocalPath(clientId, archiveName);
            if (File.Exists(path))
            {
                File.Delete(path);
                Debug.Log($"[Archive] Deleted: {archiveName}");
            }
        }

        public void ApplyLoadedData(ArchiveSavePayload serverData)
        {
            if (serverData == null) return;

            var localData = new LocalArchiveData
            {
                ArchiveName = serverData.ArchiveName,
                ClientId = serverData.ClientId,
                SceneId = serverData.SceneId,
                SaveTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                GlobalState = serverData.GlobalState ?? new List<KVPair>(),
                Entities = serverData.Entities ?? new List<EntitySyncData>(),
                SceneState = serverData.SceneState
            };

            SaveLocalArchive(localData);
        }

        public ArchiveSavePayload ToServerPayload(LocalArchiveData localData)
        {
            return new ArchiveSavePayload
            {
                ArchiveName = localData.ArchiveName,
                ClientId = localData.ClientId,
                SceneId = localData.SceneId,
                GlobalState = localData.GlobalState ?? new List<KVPair>(),
                Entities = localData.Entities ?? new List<EntitySyncData>(),
                SceneState = localData.SceneState
            };
        }

        private string GetLocalPath(string clientId, string archiveName)
        {
            var clientDir = Path.Combine(_localArchiveDir, Sanitize(clientId));
            Directory.CreateDirectory(clientDir);
            return Path.Combine(clientDir, Sanitize(archiveName) + Constants.ArchiveExtension);
        }

        private static string Sanitize(string input)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var safe = new char[input.Length];
            for (int i = 0; i < input.Length; i++)
                safe[i] = Array.IndexOf(invalid, input[i]) >= 0 ? '_' : input[i];
            return new string(safe);
        }
    }
}
