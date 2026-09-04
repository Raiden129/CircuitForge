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
		private readonly CircuitCommandService commandService = new();
		public int circuitRevision => commandService.Revision;

		[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
		private static void Init()
		{
			if (instance != null) return;
			GameObject go = new("CircuitForgeBridge");
			instance = go.AddComponent<CircuitForgeBridge>();
			DontDestroyOnLoad(go);
			Debug.Log("[CircuitForgeBridge] Bridge initialized and ready for WebMCP");
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

		private static bool IsMutatingCommand(string cmd)
		{
			return cmd is "add_component" or "connect" or "disconnect" or "set_input" or "undo" or "redo" or "delete_component" or "clear_workspace";
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

				// Check expected revision for mutating commands
				if (req.expected_revision.HasValue && req.expected_revision.Value > 0)
				{
					if (IsMutatingCommand(req.command))
					{
						if (!commandService.CheckRevision(req.expected_revision.Value, out var revErr))
						{
							SendError(requestId, revErr.ErrorCode, revErr.ErrorMessage, revErr.RecoveryHint);
							return;
						}
					}
				}

				switch (req.command)
				{
					case "ping":
						SendResponse(requestId, true, "pong", new Dictionary<string, object>
						{
							{ "status", "alive" },
							{ "revision", circuitRevision },
							{ "time", Time.time }
						});
						break;

					case "get_capabilities":
						SendResponse(requestId, true, "Active WebMCP capabilities retrieved", new Dictionary<string, object>
						{
							{ "bundles", new[] { "inspect", "edit", "simulate", "learn" } },
							{ "active_chip", Project.ActiveProject != null ? Project.ActiveProject.ActiveDevChipName : "" },
							{ "can_edit", Project.ActiveProject != null && Project.ActiveProject.CanEditViewedChip },
							{ "paused", Project.ActiveProject != null && Project.ActiveProject.simPaused },
							{ "revision", circuitRevision }
						});
						break;

					case "get_snapshot":
						HandleGetSnapshot(requestId, req);
						break;

					case "list_catalog":
						HandleListCatalog(requestId, req);
						break;

					case "set_input":
						HandleSetInput(requestId, req);
						break;

					case "pause":
						if (Project.ActiveProject != null) Project.ActiveProject.description.Prefs_SimPaused = true;
						SendResponse(requestId, true, "Simulation paused", new Dictionary<string, object> { { "paused", true } });
						break;

					case "run":
						if (Project.ActiveProject != null) Project.ActiveProject.description.Prefs_SimPaused = false;
						SendResponse(requestId, true, "Simulation running", new Dictionary<string, object> { { "paused", false } });
						break;

					case "step":
						HandleStep(requestId, req);
						break;

					case "add_component":
						HandleAddComponent(requestId, req);
						break;

					case "connect":
						HandleConnect(requestId, req);
						break;

					case "disconnect":
						HandleDisconnect(requestId, req);
						break;

					case "inspect_component":
						HandleInspectComponent(requestId, req);
						break;

					case "analyze":
						HandleAnalyze(requestId, req);
						break;

					case "undo":
						DispatchCommandResult(requestId, commandService.Undo());
						break;

					case "redo":
						DispatchCommandResult(requestId, commandService.Redo());
						break;

					case "delete_component":
						HandleDeleteComponent(requestId, req);
						break;

					case "clear_workspace":
						DispatchCommandResult(requestId, commandService.ClearWorkspace());
						break;

					case "verify_truth_table":
						HandleVerifyTruthTable(requestId, req);
						break;

					case "package_chip":
						HandlePackageChip(requestId, req);
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
				var subInputs = sub.InputPins != null ? sub.InputPins.Select(p => new
				{
					name = p.Name,
					id = p.Address.PinID,
					bit_count = (int)p.bitCount,
					state = PinState.GetBitStates(p.State)
				}).ToArray() : Array.Empty<object>();

				var subOutputs = sub.OutputPins != null ? sub.OutputPins.Select(p => new
				{
					name = p.Name,
					id = p.Address.PinID,
					bit_count = (int)p.bitCount,
					state = PinState.GetBitStates(p.State)
				}).ToArray() : Array.Empty<object>();

				subchipsList.Add(new
				{
					id = sub.ID,
					name = sub.Description.Name,
					label = sub.Label,
					position = new { x = sub.Position.x, y = sub.Position.y },
					input_pin_count = subInputs.Length,
					output_pin_count = subOutputs.Length,
					input_pins = subInputs,
					output_pins = subOutputs
				});
			}

			var inputPinsList = new List<object>();
			foreach (var p in devChip.GetInputPins())
			{
				inputPinsList.Add(new
				{
					id = p.ID,
					name = p.Name,
					bit_count = (int)p.BitCount,
					position = new { x = p.Position.x, y = p.Position.y },
					state = PinState.GetBitStates(p.Pin.State)
				});
			}

			var outputPinsList = new List<object>();
			foreach (var p in devChip.GetOutputPins())
			{
				outputPinsList.Add(new
				{
					id = p.ID,
					name = p.Name,
					bit_count = (int)p.BitCount,
					position = new { x = p.Position.x, y = p.Position.y },
					state = PinState.GetBitStates(p.Pin.State)
				});
			}

			var wiresList = new List<object>();
			foreach (var w in devChip.Wires)
			{
				ushort wireSignal = w.SourcePin != null ? PinState.GetBitStates(w.SourcePin.State) : (ushort)0;
				wiresList.Add(new
				{
					wire_id = w.spawnOrder,
					source = w.SourcePin != null ? $"{w.SourcePin.Address.PinOwnerID}:{w.SourcePin.Address.PinID}" : "",
					source_name = w.SourcePin != null ? w.SourcePin.Name : "",
					target = w.TargetPin != null ? $"{w.TargetPin.Address.PinOwnerID}:{w.TargetPin.Address.PinID}" : "",
					target_name = w.TargetPin != null ? w.TargetPin.Name : "",
					signal = wireSignal
				});
			}

			string projName = Project.ActiveProject.description.ProjectName;
			if (string.IsNullOrEmpty(projName)) projName = "Sandbox";

			var data = new Dictionary<string, object>
			{
				{ "project_name", projName },
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

		private void HandleListCatalog(string requestId, BridgeRequestModel req)
		{
			var builtinChips = BuiltinChipCreator.CreateAllBuiltinChipDescriptions()
				.Select(b => new
				{
					name = b.Name,
					type = "builtin",
					input_pins = b.InputPins.Select(p => new { name = p.Name, bit_count = (int)p.BitCount }).ToArray(),
					output_pins = b.OutputPins.Select(p => new { name = p.Name, bit_count = (int)p.BitCount }).ToArray()
				}).ToList();

			var customChipNames = Project.ActiveProject != null && Project.ActiveProject.chipLibrary != null
				? Project.ActiveProject.chipLibrary.GetAllCustomChipNames()
				: Array.Empty<string>();

			var customChips = new List<object>();
			if (Project.ActiveProject != null && Project.ActiveProject.chipLibrary != null)
			{
				foreach (var name in customChipNames)
				{
					if (Project.ActiveProject.chipLibrary.TryGetChipDescription(name, out var desc))
					{
						customChips.Add(new
						{
							name = desc.Name,
							type = "custom",
							input_pins = desc.InputPins.Select(p => new { name = p.Name, bit_count = (int)p.BitCount }).ToArray(),
							output_pins = desc.OutputPins.Select(p => new { name = p.Name, bit_count = (int)p.BitCount }).ToArray()
						});
					}
				}
			}

			SendResponse(requestId, true, $"Catalog: {builtinChips.Count} built-in chips, {customChips.Count} custom chips", new Dictionary<string, object>
			{
				{ "builtin_count", builtinChips.Count },
				{ "custom_count", customChips.Count },
				{ "builtin_chips", builtinChips },
				{ "custom_chips", customChips }
			}, new[] { "circuit_add_component", "circuit_get_snapshot" });
		}

		private void HandleSetInput(string requestId, BridgeRequestModel req)
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				SendError(requestId, "NO_ACTIVE_PROJECT", "No active circuit project loaded");
				return;
			}

			var payload = req.payload;
			if (payload == null)
			{
				SendError(requestId, "MISSING_PAYLOAD", "Missing payload for set_input");
				return;
			}

			string pinIdOrName = payload.ContainsKey("pin_id") ? payload["pin_id"]?.ToString() : (payload.ContainsKey("name") ? payload["name"]?.ToString() : null);
			if (string.IsNullOrEmpty(pinIdOrName))
			{
				SendError(requestId, "INVALID_PIN_SPECIFIER", "Must specify pin_id or name");
				return;
			}

			DevChipInstance devChip = Project.ActiveProject.ViewedChip;
			DevPinInstance targetPin = devChip.GetInputPins().FirstOrDefault(p => p.ID.ToString() == pinIdOrName || (p.Name != null && p.Name.Equals(pinIdOrName, StringComparison.OrdinalIgnoreCase)));

			if (targetPin == null)
			{
				SendError(requestId, "PIN_NOT_FOUND", $"Input pin '{pinIdOrName}' not found on active chip");
				return;
			}

			if (payload.ContainsKey("value"))
			{
				int val = Convert.ToInt32(payload["value"]);
				PinState.Set(ref targetPin.Pin.PlayerInputState, (ushort)val, 0);
			}
			else
			{
				targetPin.ToggleState(0);
			}

			commandService.BumpRevision();
			ushort currentVal = PinState.GetBitStates(targetPin.Pin.PlayerInputState);

			SendResponse(requestId, true, $"Set input '{targetPin.Name}' to {currentVal}", new Dictionary<string, object>
			{
				{ "pin_id", targetPin.ID },
				{ "name", targetPin.Name },
				{ "value", currentVal },
				{ "revision", circuitRevision }
			}, new[] { "circuit_step", "circuit_get_snapshot" });
		}

		private void HandleStep(string requestId, BridgeRequestModel req)
		{
			if (Project.ActiveProject == null)
			{
				SendError(requestId, "NO_ACTIVE_PROJECT", "No active circuit project loaded");
				return;
			}

			int steps = 1;
			if (req.payload != null && req.payload.ContainsKey("steps"))
			{
				steps = Math.Max(1, Math.Min(100, Convert.ToInt32(req.payload["steps"])));
			}

			for (int i = 0; i < steps; i++)
			{
				Project.ActiveProject.advanceSingleSimStep = true;
			}

			commandService.BumpRevision();
			SendResponse(requestId, true, $"Stepped simulation by {steps} tick(s)", new Dictionary<string, object>
			{
				{ "steps", steps },
				{ "revision", circuitRevision }
			});
		}

		private void HandleAddComponent(string requestId, BridgeRequestModel req)
		{
			string chipType = null;
			if (req.payload != null)
			{
				if (req.payload.ContainsKey("type")) chipType = req.payload["type"]?.ToString();
				else if (req.payload.ContainsKey("name")) chipType = req.payload["name"]?.ToString();
			}

			float? x = null;
			float? y = null;
			if (req.payload != null && req.payload.ContainsKey("x")) x = Convert.ToSingle(req.payload["x"]);
			if (req.payload != null && req.payload.ContainsKey("y")) y = Convert.ToSingle(req.payload["y"]);

			string label = req.payload != null && req.payload.ContainsKey("label") ? req.payload["label"]?.ToString() : null;
			int? customId = req.payload != null && req.payload.ContainsKey("component_id") ? Convert.ToInt32(req.payload["component_id"]) : null;

			var res = commandService.AddComponent(chipType, x, y, label, customId);
			DispatchCommandResult(requestId, res);
		}

		private void HandleConnect(string requestId, BridgeRequestModel req)
		{
			object src = null;
			object tgt = null;
			if (req.payload != null)
			{
				if (req.payload.ContainsKey("source_pin")) src = req.payload["source_pin"];
				else if (req.payload.ContainsKey("source")) src = req.payload["source"];

				if (req.payload.ContainsKey("target_pin")) tgt = req.payload["target_pin"];
				else if (req.payload.ContainsKey("target")) tgt = req.payload["target"];
			}

			var res = commandService.ConnectPins(src, tgt);
			DispatchCommandResult(requestId, res);
		}

		private void HandleDisconnect(string requestId, BridgeRequestModel req)
		{
			int? wireId = null;
			object src = null;
			object tgt = null;
			if (req.payload != null)
			{
				if (req.payload.ContainsKey("wire_id")) wireId = Convert.ToInt32(req.payload["wire_id"]);
				if (req.payload.ContainsKey("source_pin")) src = req.payload["source_pin"];
				if (req.payload.ContainsKey("target_pin")) tgt = req.payload["target_pin"];
			}

			var res = commandService.DisconnectWire(wireId, src, tgt);
			DispatchCommandResult(requestId, res);
		}

		private void HandleInspectComponent(string requestId, BridgeRequestModel req)
		{
			object comp = null;
			if (req.payload != null)
			{
				if (req.payload.ContainsKey("component_id")) comp = req.payload["component_id"];
				else if (req.payload.ContainsKey("name")) comp = req.payload["name"];
			}

			var res = commandService.InspectComponent(comp);
			DispatchCommandResult(requestId, res);
		}

		private void HandleAnalyze(string requestId, BridgeRequestModel req)
		{
			string scope = "all";
			if (req.payload != null && req.payload.ContainsKey("scope"))
			{
				scope = req.payload["scope"]?.ToString() ?? "all";
			}

			var res = commandService.AnalyzeCircuit(scope);
			DispatchCommandResult(requestId, res);
		}

		private void HandleDeleteComponent(string requestId, BridgeRequestModel req)
		{
			object comp = null;
			if (req.payload != null)
			{
				if (req.payload.ContainsKey("component_id")) comp = req.payload["component_id"];
				else if (req.payload.ContainsKey("name")) comp = req.payload["name"];
			}

			var res = commandService.DeleteComponent(comp);
			DispatchCommandResult(requestId, res);
		}

		private void HandleVerifyTruthTable(string requestId, BridgeRequestModel req)
		{
			object inputs = null;
			object outputs = null;
			object rows = null;
			int ticksPerRow = 2;

			if (req.payload != null)
			{
				if (req.payload.ContainsKey("inputs")) inputs = req.payload["inputs"];
				if (req.payload.ContainsKey("outputs")) outputs = req.payload["outputs"];
				if (req.payload.ContainsKey("rows")) rows = req.payload["rows"];
				else if (req.payload.ContainsKey("expected")) rows = req.payload["expected"];
				if (req.payload.ContainsKey("ticks_per_row")) ticksPerRow = Convert.ToInt32(req.payload["ticks_per_row"]);
			}

			var res = commandService.VerifyTruthTable(inputs, outputs, rows, ticksPerRow);
			DispatchCommandResult(requestId, res);
		}

		private void HandlePackageChip(string requestId, BridgeRequestModel req)
		{
			string name = null;
			string color = null;
			bool clearWorkspace = true;

			if (req.payload != null)
			{
				if (req.payload.ContainsKey("name")) name = req.payload["name"]?.ToString();
				if (req.payload.ContainsKey("color")) color = req.payload["color"]?.ToString();
				if (req.payload.ContainsKey("clear_workspace")) clearWorkspace = Convert.ToBoolean(req.payload["clear_workspace"]);
			}

			var res = commandService.PackageChip(name, color, clearWorkspace);
			DispatchCommandResult(requestId, res);
		}

		private void DispatchCommandResult(string requestId, CommandResult res)
		{
			if (res.Ok)
			{
				SendResponse(requestId, true, res.Summary, res.Data, res.NextActions);
			}
			else
			{
				SendError(requestId, res.ErrorCode, res.ErrorMessage, res.RecoveryHint);
			}
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

		private void SendError(string requestId, string code, string message, string recovery = null)
		{
			var resp = new BridgeResponseModel
			{
				request_id = requestId,
				ok = false,
				circuit_revision = circuitRevision,
				summary = $"Error: {message}",
				error = new BridgeErrorModel { code = code, message = message },
				recovery = recovery,
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
			Debug.Log($"[CircuitForgeBridge] Dispatch: ID={requestId} JSON={json}");
#endif
		}
	}

	[Serializable]
	public class BridgeRequestModel
	{
		public string request_id;
		public string command;
		public int? expected_revision;
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
