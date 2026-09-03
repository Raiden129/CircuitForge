using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using UnityEngine;
using DLS.Game;
using DLS.Description;
using DLS.Simulation;
using Newtonsoft.Json;

namespace DLS.Bridge
{
	public class CircuitForgeBridge : MonoBehaviour
	{
		[DllImport("__Internal")]
		private static extern void CircuitForgeResolve(string requestId, string responseJson);

		private static CircuitForgeBridge instance;
		private readonly Queue<string> incomingQueue = new();
		private int circuitRevision = 1;

		[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
		private static void Init()
		{
			if (instance != null) return;
			GameObject go = new("CircuitForgeBridge");
			instance = go.AddComponent<CircuitForgeBridge>();
			DontDestroyOnLoad(go);
			Debug.Log("[CircuitForgeBridge] Bridge initialized and listening for WebMCP messages");
		}

		public void Receive(string requestJson)
		{
			if (string.IsNullOrEmpty(requestJson)) return;
			lock (incomingQueue)
			{
				incomingQueue.Enqueue(requestJson);
			}
		}

		private void Update()
		{
			while (true)
			{
				string nextRequest = null;
				lock (incomingQueue)
				{
					if (incomingQueue.Count > 0)
					{
						nextRequest = incomingQueue.Dequeue();
					}
				}

				if (nextRequest == null) break;
				ProcessRequest(nextRequest);
			}
		}

		private void ProcessRequest(string requestJson)
		{
			string requestId = Guid.NewGuid().ToString();
			try
			{
				var req = JsonConvert.DeserializeObject<BridgeRequestModel>(requestJson);
				if (req != null && !string.IsNullOrEmpty(req.request_id))
				{
					requestId = req.request_id;
				}

				if (req == null)
				{
					SendError(requestId, "INVALID_REQUEST", "Failed to deserialize request JSON");
					return;
				}

				switch (req.command)
				{
					case "ping":
						SendResponse(requestId, true, "pong", new Dictionary<string, object>
						{
							{ "status", "alive" },
							{ "time", Time.time }
						});
						break;

					case "get_capabilities":
						SendResponse(requestId, true, "Active WebMCP capabilities retrieved", new Dictionary<string, object>
						{
							{ "bundles", new[] { "inspect", "edit", "simulate" } },
							{ "active_chip", Project.ActiveProject != null ? Project.ActiveProject.ActiveDevChipName : "" },
							{ "can_edit", Project.ActiveProject != null && Project.ActiveProject.CanEditViewedChip },
							{ "paused", Project.ActiveProject != null && Project.ActiveProject.SimPaused }
						});
						break;

					case "get_snapshot":
						HandleGetSnapshot(requestId, req);
						break;

					default:
						SendError(requestId, "UNKNOWN_COMMAND", $"Command not recognized: {req.command}");
						break;
				}
			}
			catch (Exception ex)
			{
				Debug.LogError($"[CircuitForgeBridge] Error processing request: {ex}");
				SendError(requestId, "EXECUTION_EXCEPTION", ex.Message);
			}
		}

		private void HandleGetSnapshot(string requestId, BridgeRequestModel req)
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				SendError(requestId, "NO_ACTIVE_PROJECT", "No active circuit project or chip is currently loaded");
				return;
			}

			DevChipInstance devChip = Project.ActiveProject.ViewedChip;
			string chipName = Project.ActiveProject.ActiveDevChipName;

			var subchipsList = new List<object>();
			foreach (var sub in devChip.GetSubchips())
			{
				subchipsList.Add(new
				{
					id = sub.ID,
					name = sub.Description.Name,
					label = sub.Label,
					position = new { x = sub.Position.x, y = sub.Position.y },
					input_pin_count = sub.InputPins.Length,
					output_pin_count = sub.OutputPins.Length
				});
			}

			var inputPinsList = new List<object>();
			foreach (var p in devChip.GetInputPins())
			{
				inputPinsList.Add(new
				{
					id = p.ID,
					name = p.PinName,
					bit_count = p.BitCount,
					position = new { x = p.Position.x, y = p.Position.y },
					state = p.State.ToString()
				});
			}

			var outputPinsList = new List<object>();
			foreach (var p in devChip.GetOutputPins())
			{
				outputPinsList.Add(new
				{
					id = p.ID,
					name = p.PinName,
					bit_count = p.BitCount,
					position = new { x = p.Position.x, y = p.Position.y },
					state = p.State.ToString()
				});
			}

			var wiresList = new List<object>();
			foreach (var w in devChip.Wires)
			{
				wiresList.Add(new
				{
					wire_id = w.ID,
					source_pin_id = w.SourcePin != null ? w.SourcePin.ID : 0,
					target_pin_id = w.TargetPin != null ? w.TargetPin.ID : 0
				});
			}

			var data = new Dictionary<string, object>
			{
				{ "project_name", Project.ActiveProject.description.ProjectName },
				{ "active_chip", chipName },
				{ "revision", circuitRevision },
				{ "subchip_count", subchipsList.Count },
				{ "wire_count", wiresList.Count },
				{ "subchips", subchipsList },
				{ "input_pins", inputPinsList },
				{ "output_pins", outputPinsList },
				{ "wires", wiresList }
			};

			SendResponse(requestId, true, $"Snapshot of '{chipName}': {subchipsList.Count} components, {wiresList.Count} wires, {inputPinsList.Count} inputs, {outputPinsList.Count} outputs", data, new[] { "circuit_add_component", "circuit_connect", "circuit_set_input" });
		}

		private void SendResponse(string requestId, bool ok, string summary, Dictionary<string, object> data, string[] nextActions = null)
		{
			var resp = new BridgeResponseModel
			{
				request_id = requestId,
				ok = ok,
				circuit_revision = circuitRevision,
				summary = summary,
				data = data ?? new Dictionary<string, object>(),
				warnings = new List<string>(),
				next_actions = nextActions != null ? new List<string>(nextActions) : new List<string>()
			};

			string json = JsonConvert.SerializeObject(resp);
			DispatchToBrowser(requestId, json);
		}

		private void SendError(string requestId, string code, string message)
		{
			var resp = new BridgeResponseModel
			{
				request_id = requestId,
				ok = false,
				circuit_revision = circuitRevision,
				summary = $"Error: {message}",
				error = new BridgeErrorModel { code = code, message = message },
				data = new Dictionary<string, object>(),
				warnings = new List<string>(),
				next_actions = new List<string>()
			};

			string json = JsonConvert.SerializeObject(resp);
			DispatchToBrowser(requestId, json);
		}

		private void DispatchToBrowser(string requestId, string json)
		{
#if UNITY_WEBGL && !UNITY_EDITOR
			try
			{
				CircuitForgeResolve(requestId, json);
			}
			catch (Exception ex)
			{
				Debug.LogError($"[CircuitForgeBridge] JSLIB call failed: {ex}");
			}
#else
			Debug.Log($"[CircuitForgeBridge] (Non-WebGL / Editor Dispatch) ID={requestId} JSON={json}");
#endif
		}
	}

	[Serializable]
	public class BridgeRequestModel
	{
		public string request_id;
		public string command;
		public int expected_revision;
		public Dictionary<string, object> payload;
	}

	[Serializable]
	public class BridgeErrorModel
	{
		public string code;
		public string message;
	}

	[Serializable]
	public class BridgeResponseModel
	{
		public string request_id;
		public bool ok;
		public int circuit_revision;
		public string summary;
		public Dictionary<string, object> data;
		public List<string> warnings;
		public BridgeErrorModel error;
		public string recovery;
		public List<string> next_actions;
	}
}
