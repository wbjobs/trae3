
using UnityEngine;
using PolarShared.Models;

namespace PolarClient.Game
{
    public class RemotePlayer : MonoBehaviour
    {
        public string PlayerId { get; private set; }
        public string PlayerName { get; private set; }

        [Header("同步设置")]
        public float positionLerpSpeed = 10f;
        public float rotationLerpSpeed = 10f;
        public float maxExtrapolationTime = 0.1f;
        public float timeoutSeconds = 5f;

        private Vector3 _targetPosition;
        private Vector3 _targetRotation;
        private Vector3 _positionVelocity;
        private PlayerState _currentState;
        private float _lastUpdateTime;
        private bool _isActive = true;

        public void Initialize(PlayerState state)
        {
            PlayerId = state.PlayerId;
            PlayerName = state.PlayerName;
            _currentState = state;
            _lastUpdateTime = Time.time;

            transform.position = new Vector3(state.Position.X, state.Position.Y, state.Position.Z);
            transform.eulerAngles = new Vector3(state.Rotation.X, state.Rotation.Y, state.Rotation.Z);

            _targetPosition = transform.position;
            _targetRotation = transform.eulerAngles;
            _positionVelocity = Vector3.zero;

            UpdateVisuals();
        }

        public void UpdateState(PlayerState state)
        {
            _currentState = state;
            _targetPosition = new Vector3(state.Position.X, state.Position.Y, state.Position.Z);
            _targetRotation = new Vector3(state.Rotation.X, state.Rotation.Y, state.Rotation.Z);
            _lastUpdateTime = Time.time;
            _isActive = true;
        }

        private void Update()
        {
            if (!_isActive)
            {
                var color = GetComponentInChildren<Renderer>()?.material.color ?? Color.white;
                color.a = Mathf.Lerp(color.a, 1.0f, Time.deltaTime * 5f);
                var renderer = GetComponentInChildren<Renderer>();
                if (renderer != null)
                {
                    var mat = renderer.material;
                    mat.color = color;
                }
            }

            var timeSinceLastUpdate = Time.time - _lastUpdateTime;
            if (timeSinceLastUpdate > timeoutSeconds)
            {
                _isActive = false;

                var color = GetComponentInChildren<Renderer>()?.material.color ?? Color.white;
                color.a = Mathf.Lerp(color.a, 0.3f, Time.deltaTime * 2f);
                var renderer = GetComponentInChildren<Renderer>();
                if (renderer != null)
                {
                    var mat = renderer.material;
                    mat.color = color;
                }
            }

            if (timeSinceLastUpdate < maxExtrapolationTime)
            {
                transform.position = Vector3.SmoothDamp(
                    transform.position, _targetPosition, ref _positionVelocity, 1f / positionLerpSpeed);
            }
            else
            {
                transform.position = Vector3.Lerp(transform.position, _targetPosition, positionLerpSpeed * Time.deltaTime);
            }

            var currentEuler = transform.eulerAngles;
            var newEuler = new Vector3(
                Mathf.LerpAngle(currentEuler.x, _targetRotation.x, rotationLerpSpeed * Time.deltaTime),
                Mathf.LerpAngle(currentEuler.y, _targetRotation.y, rotationLerpSpeed * Time.deltaTime),
                Mathf.LerpAngle(currentEuler.z, _targetRotation.z, rotationLerpSpeed * Time.deltaTime)
            );
            transform.eulerAngles = newEuler;
        }

        private void UpdateVisuals()
        {
            var nameTag = new GameObject("NameTag");
            nameTag.transform.SetParent(transform);
            nameTag.transform.localPosition = new Vector3(0, 2.5f, 0);

            var textMesh = nameTag.AddComponent<TextMesh>();
            textMesh.text = PlayerName;
            textMesh.fontSize = 24;
            textMesh.alignment = TextAlignment.Center;
            textMesh.anchor = TextAnchor.MiddleCenter;
            textMesh.color = Color.white;

            var billboard = nameTag.AddComponent<Billboard>();
        }
    }

    public class Billboard : MonoBehaviour
    {
        private Camera _mainCamera;

        private void Start()
        {
            _mainCamera = Camera.main;
        }

        private void LateUpdate()
        {
            if (_mainCamera == null)
            {
                _mainCamera = Camera.main;
                return;
            }

            transform.LookAt(transform.position + _mainCamera.transform.rotation * Vector3.forward,
                _mainCamera.transform.rotation * Vector3.up);
        }
    }
}
