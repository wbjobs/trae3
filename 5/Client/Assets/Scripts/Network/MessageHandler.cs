using System;
using System.Collections.Generic;
using Shared.Common;
using Shared.Proto;
using UnityEngine;

namespace Client.Network
{
    public class MessageHandler
    {
        private readonly Dictionary<MsgType, List<Action<NetworkMessage>>> _handlers = new Dictionary<MsgType, List<Action<NetworkMessage>>>();

        public void RegisterHandler(MsgType type, Action<NetworkMessage> handler)
        {
            if (!_handlers.ContainsKey(type))
                _handlers[type] = new List<Action<NetworkMessage>>();
            _handlers[type].Add(handler);
        }

        public void UnregisterHandler(MsgType type, Action<NetworkMessage> handler)
        {
            if (_handlers.TryGetValue(type, out var list))
                list.Remove(handler);
        }

        public void Dispatch(NetworkMessage msg)
        {
            var msgType = (MsgType)msg.Type;
            if (_handlers.TryGetValue(msgType, out var list))
            {
                for (int i = list.Count - 1; i >= 0; i--)
                {
                    try
                    {
                        list[i](msg);
                    }
                    catch (Exception ex)
                    {
                        Debug.LogError($"[MsgHandler] Error handling {msgType}: {ex.Message}");
                    }
                }
            }
        }
    }
}
