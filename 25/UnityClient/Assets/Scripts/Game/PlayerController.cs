
using UnityEngine;
using PolarClient.Core;
using PolarClient.Network;

namespace PolarClient.Game
{
    public class PlayerController : MonoBehaviour
    {
        [Header("移动设置")]
        public float moveSpeed = 5.0f;
        public float rotationSpeed = 100.0f;
        public float positionUpdateInterval = 0.1f;

        [Header("环境效果")]
        public float warmthDrainRate = 0.5f;
        public float energyDrainRate = 0.3f;
        public float warmthRecoveryRate = 1.0f;
        public float energyRecoveryRate = 0.5f;

        private CharacterController _controller;
        private float _lastPositionUpdate;
        private bool _isNearHeatSource;

        private INetworkClient? _networkClient;
        private IGameState? _gameState;

        public float CurrentWarmth { get; private set; } = 100f;
        public float CurrentEnergy { get; private set; } = 100f;
        public float CurrentHealth { get; private set; } = 100f;

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
            if (_controller == null)
            {
                _controller = gameObject.AddComponent<CharacterController>();
            }
        }

        private void Start()
        {
            _networkClient = ServiceLocator.Get<INetworkClient>();
            _gameState = ServiceLocator.Get<IGameState>();

            CurrentWarmth = 100f;
            CurrentEnergy = 100f;
            CurrentHealth = 100f;
        }

        private void Update()
        {
            if (_networkClient == null || !_networkClient.IsConnected) return;

            HandleMovement();
            HandleEnvironmentEffects();
            UpdateServerPosition();
        }

        private void HandleMovement()
        {
            var horizontal = Input.GetAxis("Horizontal");
            var vertical = Input.GetAxis("Vertical");

            var moveDirection = new Vector3(horizontal, 0, vertical);
            moveDirection = transform.TransformDirection(moveDirection);

            if (moveDirection.magnitude > 0.1f)
            {
                _controller.Move(moveDirection * moveSpeed * Time.deltaTime);
            }

            var rotation = Input.GetAxis("Mouse X") * rotationSpeed * Time.deltaTime;
            transform.Rotate(0, rotation, 0);
        }

        private void HandleEnvironmentEffects()
        {
            var env = _gameState?.CurrentEnvironment;
            if (env == null) return;

            var windChill = env.CalculateWindChill();
            var warmthDrain = Mathf.Abs(windChill) * warmthDrainRate * 0.01f;

            if (_isNearHeatSource)
            {
                CurrentWarmth = Mathf.Min(100f, CurrentWarmth + warmthRecoveryRate * Time.deltaTime);
            }
            else
            {
                CurrentWarmth = Mathf.Max(0f, CurrentWarmth - warmthDrain * Time.deltaTime);
            }

            var isMoving = Mathf.Abs(Input.GetAxis("Horizontal")) > 0.01f || 
                           Mathf.Abs(Input.GetAxis("Vertical")) > 0.01f;
            if (isMoving)
            {
                CurrentEnergy = Mathf.Max(0f, CurrentEnergy - energyDrainRate * Time.deltaTime);
            }
            else
            {
                CurrentEnergy = Mathf.Min(100f, CurrentEnergy + energyRecoveryRate * 0.5f * Time.deltaTime);
            }

            if (CurrentWarmth <= 0f)
            {
                CurrentHealth = Mathf.Max(0f, CurrentHealth - 5f * Time.deltaTime);
            }

            if (CurrentEnergy <= 0f)
            {
                moveSpeed = 2.0f;
            }
            else
            {
                moveSpeed = 5.0f;
            }

            _gameState?.UpdateLocalPlayerState(CurrentHealth, CurrentWarmth, CurrentEnergy);
        }

        private void UpdateServerPosition()
        {
            if (Time.time - _lastPositionUpdate >= positionUpdateInterval)
            {
                _networkClient?.SendPlayerPosition(
                    transform.position,
                    transform.eulerAngles
                );
                _lastPositionUpdate = Time.time;
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag("HeatSource"))
            {
                _isNearHeatSource = true;
            }
        }

        private void OnTriggerExit(Collider other)
        {
            if (other.CompareTag("HeatSource"))
            {
                _isNearHeatSource = false;
            }
        }

        public void Heal(float amount)
        {
            CurrentHealth = Mathf.Min(100f, CurrentHealth + amount);
        }

        public void WarmUp(float amount)
        {
            CurrentWarmth = Mathf.Min(100f, CurrentWarmth + amount);
        }

        public void Rest(float amount)
        {
            CurrentEnergy = Mathf.Min(100f, CurrentEnergy + amount);
        }
    }
}
