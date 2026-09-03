using System;
using System.Collections.Generic;
using System.Linq;
using DLS.Description;
using DLS.Game;
using DLS.SaveSystem;
using DLS.Simulation;
using UnityEngine;

namespace DLS.Bridge
{
	public class CommandResult
	{
		public bool Ok { get; set; }
		public int Revision { get; set; }
		public string Summary { get; set; }
		public Dictionary<string, object> Data { get; set; } = new();
		public string ErrorCode { get; set; }
		public string ErrorMessage { get; set; }
		public string RecoveryHint { get; set; }
		public string[] NextActions { get; set; } = Array.Empty<string>();

		public static CommandResult Success(int revision, string summary, Dictionary<string, object> data = null, string[] nextActions = null)
		{
			return new CommandResult
			{
				Ok = true,
				Revision = revision,
				Summary = summary,
				Data = data ?? new Dictionary<string, object>(),
				NextActions = nextActions ?? Array.Empty<string>()
			};
		}

		public static CommandResult Fail(string code, string message, int revision, string recovery = null)
		{
			return new CommandResult
			{
				Ok = false,
				ErrorCode = code,
				ErrorMessage = message,
				Revision = revision,
				RecoveryHint = recovery
			};
		}
	}

	public class CircuitCommandService
	{
		public int Revision { get; private set; } = 1;

		public bool CheckRevision(int? expectedRevision, out CommandResult mismatchError)
		{
			mismatchError = null;
			if (expectedRevision.HasValue && expectedRevision.Value != Revision)
			{
				mismatchError = CommandResult.Fail(
					"REVISION_MISMATCH",
					$"Circuit revision mismatch. Expected {expectedRevision.Value}, but current simulation revision is {Revision}.",
					Revision,
					"Call circuit_get_snapshot to synchronize your client state with the latest circuit topology before mutating."
				);
				return false;
			}
			return true;
		}

		public void BumpRevision()
		{
			Revision++;
		}

		public CommandResult AddComponent(string chipType, float? x, float? y, string label, int? customId)
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				return CommandResult.Fail("NO_ACTIVE_PROJECT", "No active circuit project loaded", Revision);
			}

			if (string.IsNullOrWhiteSpace(chipType))
			{
				return CommandResult.Fail("MISSING_ARGUMENT", "Component 'type' must be specified", Revision);
			}

			DevChipInstance activeDevChip = Project.ActiveProject.ViewedChip;

			if (!Project.ActiveProject.chipLibrary.TryGetChipDescription(chipType, out ChipDescription chipDesc))
			{
				return CommandResult.Fail("CHIP_NOT_FOUND", $"Chip '{chipType}' not found in catalog.", Revision, "Call circuit_list_catalog to inspect available built-in and custom chip types.");
			}

			int instanceID;
			if (customId.HasValue)
			{
				instanceID = customId.Value;
				if (activeDevChip.Elements.Any(e => (e is SubChipInstance s && s.ID == instanceID) || (e is DevPinInstance p && p.ID == instanceID)))
				{
					return CommandResult.Fail("DUPLICATE_COMPONENT_ID", $"A component or pin with ID {instanceID} already exists on the canvas.", Revision, "Omit 'component_id' or provide a unique ID.");
				}
			}
			else
			{
				instanceID = IDGenerator.GenerateNewElementID(activeDevChip);
			}

			int count = activeDevChip.Elements.Count;
			float posX = x ?? ((count % 4) * 2.5f - 2.5f);
			float posY = y ?? (-0.5f - (count / 4) * 2.0f);
			Vector2 pos = new Vector2(posX, posY);

			(bool isInput, bool isOutput, PinBitCount numBits) ioPinInfo = ChipTypeHelper.IsInputOrOutputPin(chipDesc.ChipType);
			IMoveable newElement;

			if (ioPinInfo.isInput || ioPinInfo.isOutput)
			{
				PinDescription pinDesc = ioPinInfo.isInput ? chipDesc.InputPins[0] : chipDesc.OutputPins[0];
				pinDesc.ID = instanceID;
				pinDesc.Position = pos;
				if (!string.IsNullOrEmpty(label)) pinDesc.Name = label;

				DevPinInstance devPin = new DevPinInstance(pinDesc, ioPinInfo.isInput);
				activeDevChip.AddNewDevPin(devPin, false);
				activeDevChip.UndoController.RecordAddElements(new List<IMoveable> { devPin }, false);
				newElement = devPin;
			}
			else
			{
				SubChipDescription subChipDesc = DescriptionCreator.CreateBuiltinSubChipDescriptionForPlacement(chipDesc.ChipType, chipDesc.Name, instanceID, pos);
				SubChipInstance subChip = new SubChipInstance(chipDesc, subChipDesc);
				if (!string.IsNullOrEmpty(label)) subChip.Label = label;

				activeDevChip.AddNewSubChip(subChip, false);
				activeDevChip.UndoController.RecordAddElements(new List<IMoveable> { subChip }, false);
				newElement = subChip;
			}

			activeDevChip.RebuildSimulation();
			BumpRevision();

			var inputPins = new List<object>();
			var outputPins = new List<object>();

			if (newElement is SubChipInstance sChip)
			{
				if (sChip.InputPins != null)
				{
					foreach (var p in sChip.InputPins)
					{
						inputPins.Add(new { name = p.Name, id = p.Address.PinID, bit_count = (int)p.bitCount, pin_ref = $"{sChip.ID}:{p.Address.PinID}" });
					}
				}
				if (sChip.OutputPins != null)
				{
					foreach (var p in sChip.OutputPins)
					{
						outputPins.Add(new { name = p.Name, id = p.Address.PinID, bit_count = (int)p.bitCount, pin_ref = $"{sChip.ID}:{p.Address.PinID}" });
					}
				}
			}
			else if (newElement is DevPinInstance dPin)
			{
				var pInfo = new { name = dPin.Name, id = 0, bit_count = (int)dPin.BitCount, pin_ref = $"{dPin.ID}:0" };
				if (dPin.IsInputPin) inputPins.Add(pInfo);
				else outputPins.Add(pInfo);
			}

			return CommandResult.Success(Revision, $"Added {chipType} (ID: {instanceID}) at ({posX:F1}, {posY:F1})", new Dictionary<string, object>
			{
				{ "component_id", instanceID },
				{ "type", chipType },
				{ "label", label ?? "" },
				{ "position", new { x = posX, y = posY } },
				{ "input_pins", inputPins },
				{ "output_pins", outputPins },
				{ "revision", Revision }
			}, new[] { "circuit_connect", "circuit_get_snapshot", "circuit_step" });
		}

		public CommandResult ConnectPins(object sourcePinRef, object targetPinRef)
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				return CommandResult.Fail("NO_ACTIVE_PROJECT", "No active circuit project loaded", Revision);
			}

			DevChipInstance activeDevChip = Project.ActiveProject.ViewedChip;

			if (!ResolvePin(activeDevChip, sourcePinRef, out PinInstance pinA, out string errA))
			{
				return CommandResult.Fail("PIN_NOT_FOUND", $"Could not find source pin: {errA}", Revision, "Verify pin IDs using circuit_get_snapshot.");
			}

			if (!ResolvePin(activeDevChip, targetPinRef, out PinInstance pinB, out string errB))
			{
				return CommandResult.Fail("PIN_NOT_FOUND", $"Could not find target pin: {errB}", Revision, "Verify pin IDs using circuit_get_snapshot.");
			}

			// Validate self-connection
			if (pinA == pinB || (pinA.parent == pinB.parent && pinA.Address.PinID == pinB.Address.PinID))
			{
				return CommandResult.Fail("SELF_CONNECTION", "Cannot connect a pin to itself.", Revision);
			}

			// Determine actual source vs target based on IsSourcePin
			PinInstance sourcePin = null;
			PinInstance targetPin = null;

			if (pinA.IsSourcePin && !pinB.IsSourcePin)
			{
				sourcePin = pinA;
				targetPin = pinB;
			}
			else if (!pinA.IsSourcePin && pinB.IsSourcePin)
			{
				sourcePin = pinB;
				targetPin = pinA;
			}
			else
			{
				if (pinA.IsSourcePin && pinB.IsSourcePin)
				{
					return CommandResult.Fail(
						"INVALID_PIN_DIRECTION",
						$"Cannot connect output pin '{pinA.Name}' ({pinA.Address}) directly to output pin '{pinB.Name}' ({pinB.Address}). One must be a source/output and one must be a target/input.",
						Revision,
						"Connect the output pin to an input pin on a gate or output display."
					);
				}
				else
				{
					return CommandResult.Fail(
						"INVALID_PIN_DIRECTION",
						$"Cannot connect input pin '{pinA.Name}' ({pinA.Address}) directly to input pin '{pinB.Name}' ({pinB.Address}). Signals must originate from a source/output.",
						Revision,
						"Connect an input pin to an output pin of a gate or an input switch."
					);
				}
			}

			// Validate bit width
			if (sourcePin.bitCount != targetPin.bitCount)
			{
				return CommandResult.Fail(
					"PIN_WIDTH_MISMATCH",
					$"Bit width mismatch: Source pin '{sourcePin.Name}' has {(int)sourcePin.bitCount} bit(s), but Target pin '{targetPin.Name}' expects {(int)targetPin.bitCount} bit(s).",
					Revision,
					$"Use a bus splitter/adapter (e.g. 1-8BIT or 8-1BIT) to adapt between {(int)sourcePin.bitCount}-bit and {(int)targetPin.bitCount}-bit signals."
				);
			}

			// Check for duplicate wire
			if (activeDevChip.Wires.Any(w => w.SourcePin == sourcePin && w.TargetPin == targetPin))
			{
				return CommandResult.Fail("DUPLICATE_WIRE", $"A wire connecting '{sourcePin.Name}' to '{targetPin.Name}' already exists.", Revision);
			}

			int spawnOrder = activeDevChip.Wires.Count;
			WireInstance.ConnectionInfo srcInfo = new WireInstance.ConnectionInfo { pin = sourcePin };
			WireInstance.ConnectionInfo tgtInfo = new WireInstance.ConnectionInfo { pin = targetPin };
			Vector2[] pts = new Vector2[] { sourcePin.GetWorldPos(), targetPin.GetWorldPos() };

			WireInstance wire = new WireInstance(srcInfo, tgtInfo, pts, spawnOrder);
			activeDevChip.AddWire(wire, false);
			activeDevChip.UndoController.RecordAddWire(wire);
			activeDevChip.RebuildSimulation();

			BumpRevision();

			return CommandResult.Success(Revision, $"Connected '{sourcePin.Name}' ({sourcePin.Address.PinOwnerID}:{sourcePin.Address.PinID}) to '{targetPin.Name}' ({targetPin.Address.PinOwnerID}:{targetPin.Address.PinID})", new Dictionary<string, object>
			{
				{ "wire_id", wire.spawnOrder },
				{ "source_pin", $"{sourcePin.Address.PinOwnerID}:{sourcePin.Address.PinID}" },
				{ "target_pin", $"{targetPin.Address.PinOwnerID}:{targetPin.Address.PinID}" },
				{ "signal", PinState.GetBitStates(sourcePin.State) },
				{ "revision", Revision }
			}, new[] { "circuit_get_snapshot", "circuit_step", "circuit_set_input" });
		}

		public CommandResult DisconnectWire(int? wireId, object sourceRef, object targetRef)
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				return CommandResult.Fail("NO_ACTIVE_PROJECT", "No active circuit project loaded", Revision);
			}

			DevChipInstance activeDevChip = Project.ActiveProject.ViewedChip;
			WireInstance wireToDelete = null;

			if (wireId.HasValue)
			{
				wireToDelete = activeDevChip.Wires.FirstOrDefault(w => w.spawnOrder == wireId.Value);
			}

			if (wireToDelete == null && sourceRef != null && targetRef != null)
			{
				if (ResolvePin(activeDevChip, sourceRef, out PinInstance pA, out _) &&
				    ResolvePin(activeDevChip, targetRef, out PinInstance pB, out _))
				{
					wireToDelete = activeDevChip.Wires.FirstOrDefault(w =>
						(w.SourcePin == pA && w.TargetPin == pB) ||
						(w.SourcePin == pB && w.TargetPin == pA)
					);
				}
			}

			if (wireToDelete == null)
			{
				return CommandResult.Fail("WIRE_NOT_FOUND", "Specified wire could not be found to disconnect.", Revision, "Call circuit_get_snapshot to inspect current wire IDs.");
			}

			int id = wireToDelete.spawnOrder;
			string src = $"{wireToDelete.SourcePin?.Address.PinOwnerID}:{wireToDelete.SourcePin?.Address.PinID}";
			string tgt = $"{wireToDelete.TargetPin?.Address.PinOwnerID}:{wireToDelete.TargetPin?.Address.PinID}";

			activeDevChip.UndoController.RecordDeleteWire(wireToDelete);
			activeDevChip.DeleteWire(wireToDelete);
			activeDevChip.RebuildSimulation();

			BumpRevision();

			return CommandResult.Success(Revision, $"Disconnected wire {id} ({src} -> {tgt})", new Dictionary<string, object>
			{
				{ "wire_id", id },
				{ "source_pin", src },
				{ "target_pin", tgt },
				{ "revision", Revision }
			}, new[] { "circuit_get_snapshot", "circuit_connect" });
		}

		public CommandResult InspectComponent(object compRef)
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				return CommandResult.Fail("NO_ACTIVE_PROJECT", "No active circuit project loaded", Revision);
			}

			DevChipInstance devChip = Project.ActiveProject.ViewedChip;
			string refStr = compRef?.ToString();

			IMoveable target = devChip.Elements.FirstOrDefault(e =>
			{
				if (e is SubChipInstance s)
					return s.ID.ToString() == refStr || s.Description.Name.Equals(refStr, StringComparison.OrdinalIgnoreCase) || s.Label.Equals(refStr, StringComparison.OrdinalIgnoreCase);
				if (e is DevPinInstance p)
					return p.ID.ToString() == refStr || p.Name.Equals(refStr, StringComparison.OrdinalIgnoreCase);
				return false;
			});

			if (target == null)
			{
				return CommandResult.Fail("COMPONENT_NOT_FOUND", $"Component '{refStr}' not found on active canvas.", Revision, "Call circuit_get_snapshot to list all placed components.");
			}

			if (target is SubChipInstance sub)
			{
				var inPins = sub.InputPins != null ? sub.InputPins.Select(p =>
				{
					var wire = devChip.Wires.FirstOrDefault(w => w.TargetPin == p);
					ushort sig = wire != null && wire.SourcePin != null ? PinState.GetBitStates(wire.SourcePin.State) : PinState.GetBitStates(p.State);
					return new
					{
						name = p.Name,
						id = p.Address.PinID,
						bit_count = (int)p.bitCount,
						state = sig,
						connected_wire_id = wire != null ? (object)wire.spawnOrder : null
					};
				}).ToArray() : Array.Empty<object>();

				var outPins = sub.OutputPins != null ? sub.OutputPins.Select(p =>
				{
					var wires = devChip.Wires.Where(w => w.SourcePin == p).Select(w => w.spawnOrder).ToArray();
					return new
					{
						name = p.Name,
						id = p.Address.PinID,
						bit_count = (int)p.bitCount,
						state = PinState.GetBitStates(p.State),
						connected_wire_ids = wires
					};
				}).ToArray() : Array.Empty<object>();

				return CommandResult.Success(Revision, $"Inspected {sub.Description.Name} (ID: {sub.ID})", new Dictionary<string, object>
				{
					{ "component_id", sub.ID },
					{ "name", sub.Description.Name },
					{ "label", sub.Label },
					{ "type", "subchip" },
					{ "position", new { x = sub.Position.x, y = sub.Position.y } },
					{ "input_pins", inPins },
					{ "output_pins", outPins }
				});
			}
			else if (target is DevPinInstance pin)
			{
				var connectedWires = devChip.Wires.Where(w => w.SourcePin == pin.Pin || w.TargetPin == pin.Pin).Select(w => w.spawnOrder).ToArray();
				return CommandResult.Success(Revision, $"Inspected DevPin '{pin.Name}' (ID: {pin.ID})", new Dictionary<string, object>
				{
					{ "component_id", pin.ID },
					{ "name", pin.Name },
					{ "type", pin.IsInputPin ? "dev_input" : "dev_output" },
					{ "position", new { x = pin.Position.x, y = pin.Position.y } },
					{ "bit_count", (int)pin.BitCount },
					{ "state", PinState.GetBitStates(pin.Pin.State) },
					{ "connected_wires", connectedWires }
				});
			}

			return CommandResult.Fail("UNKNOWN_COMPONENT_TYPE", "Component type could not be inspected", Revision);
		}

		public CommandResult AnalyzeCircuit(string scope)
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				return CommandResult.Fail("NO_ACTIVE_PROJECT", "No active circuit project loaded", Revision);
			}

			DevChipInstance devChip = Project.ActiveProject.ViewedChip;

			var floatingInputs = new List<object>();
			var unconnectedOutputs = new List<object>();

			foreach (var elem in devChip.Elements)
			{
				if (elem is SubChipInstance sub)
				{
					if (sub.InputPins != null)
					{
						foreach (var p in sub.InputPins)
						{
							if (!devChip.Wires.Any(w => w.TargetPin == p))
							{
								floatingInputs.Add(new { component = sub.Description.Name, component_id = sub.ID, pin = p.Name, pin_ref = $"{sub.ID}:{p.Address.PinID}" });
							}
						}
					}
					if (sub.OutputPins != null)
					{
						foreach (var p in sub.OutputPins)
						{
							if (!devChip.Wires.Any(w => w.SourcePin == p))
							{
								unconnectedOutputs.Add(new { component = sub.Description.Name, component_id = sub.ID, pin = p.Name, pin_ref = $"{sub.ID}:{p.Address.PinID}" });
							}
						}
					}
				}
				else if (elem is DevPinInstance devPin)
				{
					if (!devPin.IsInputPin && !devChip.Wires.Any(w => w.TargetPin == devPin.Pin))
					{
						floatingInputs.Add(new { component = devPin.Name, component_id = devPin.ID, pin = "IN", pin_ref = $"{devPin.ID}:0" });
					}
					else if (devPin.IsInputPin && !devChip.Wires.Any(w => w.SourcePin == devPin.Pin))
					{
						unconnectedOutputs.Add(new { component = devPin.Name, component_id = devPin.ID, pin = "OUT", pin_ref = $"{devPin.ID}:0" });
					}
				}
			}

			int totalComponents = devChip.Elements.Count;
			int totalWires = devChip.Wires.Count;

			string summary = $"Analysis: {totalComponents} components, {totalWires} wires. Floating inputs: {floatingInputs.Count}, Unconnected outputs: {unconnectedOutputs.Count}.";

			return CommandResult.Success(Revision, summary, new Dictionary<string, object>
			{
				{ "total_components", totalComponents },
				{ "total_wires", totalWires },
				{ "floating_inputs_count", floatingInputs.Count },
				{ "floating_inputs", floatingInputs },
				{ "unconnected_outputs_count", unconnectedOutputs.Count },
				{ "unconnected_outputs", unconnectedOutputs },
				{ "healthy", floatingInputs.Count == 0 && totalComponents > 0 }
			});
		}

		public CommandResult Undo()
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				return CommandResult.Fail("NO_ACTIVE_PROJECT", "No active circuit project loaded", Revision);
			}

			DevChipInstance devChip = Project.ActiveProject.ViewedChip;
			if (!devChip.UndoController.CanUndo)
			{
				return CommandResult.Fail("NOTHING_TO_UNDO", "No actions in undo history.", Revision);
			}

			devChip.UndoController.TryUndo();
			devChip.RebuildSimulation();
			BumpRevision();

			return CommandResult.Success(Revision, "Undid previous action", new Dictionary<string, object>
			{
				{ "revision", Revision },
				{ "can_undo", devChip.UndoController.CanUndo },
				{ "can_redo", devChip.UndoController.CanRedo }
			});
		}

		public CommandResult Redo()
		{
			if (Project.ActiveProject == null || Project.ActiveProject.ViewedChip == null)
			{
				return CommandResult.Fail("NO_ACTIVE_PROJECT", "No active circuit project loaded", Revision);
			}

			DevChipInstance devChip = Project.ActiveProject.ViewedChip;
			if (!devChip.UndoController.CanRedo)
			{
				return CommandResult.Fail("NOTHING_TO_REDO", "No actions in redo history.", Revision);
			}

			devChip.UndoController.TryRedo();
			devChip.RebuildSimulation();
			BumpRevision();

			return CommandResult.Success(Revision, "Redid action", new Dictionary<string, object>
			{
				{ "revision", Revision },
				{ "can_undo", devChip.UndoController.CanUndo },
				{ "can_redo", devChip.UndoController.CanRedo }
			});
		}

		private bool ResolvePin(DevChipInstance devChip, object pinRef, out PinInstance pin, out string error)
		{
			pin = null;
			error = null;

			if (pinRef == null)
			{
				error = "Pin reference cannot be null";
				return false;
			}

			string refStr = pinRef.ToString().Trim();

			if (refStr.Contains(":"))
			{
				string[] parts = refStr.Split(':');
				string ownerStr = parts[0].Trim();
				string pinStr = parts[1].Trim();

				IMoveable owner = devChip.Elements.FirstOrDefault(e =>
				{
					if (e is SubChipInstance s)
						return s.ID.ToString() == ownerStr || s.Description.Name.Equals(ownerStr, StringComparison.OrdinalIgnoreCase) || s.Label.Equals(ownerStr, StringComparison.OrdinalIgnoreCase);
					if (e is DevPinInstance p)
						return p.ID.ToString() == ownerStr || p.Name.Equals(ownerStr, StringComparison.OrdinalIgnoreCase);
					return false;
				});

				if (owner == null)
				{
					error = $"Owner component '{ownerStr}' not found";
					return false;
				}

				if (owner is SubChipInstance subChip)
				{
					var allPins = (subChip.InputPins ?? Array.Empty<PinInstance>()).Concat(subChip.OutputPins ?? Array.Empty<PinInstance>());
					pin = allPins.FirstOrDefault(p =>
						p.Address.PinID.ToString() == pinStr ||
						p.Name.Equals(pinStr, StringComparison.OrdinalIgnoreCase)
					);

					if (pin != null) return true;
					error = $"Pin '{pinStr}' not found on component '{subChip.Description.Name}'";
					return false;
				}
				else if (owner is DevPinInstance devPin)
				{
					pin = devPin.Pin;
					return true;
				}
			}

			DevPinInstance directDevPin = devChip.Elements.OfType<DevPinInstance>().FirstOrDefault(p =>
				p.ID.ToString() == refStr ||
				p.Name.Equals(refStr, StringComparison.OrdinalIgnoreCase)
			);

			if (directDevPin != null)
			{
				pin = directDevPin.Pin;
				return true;
			}

			error = $"Could not resolve pin '{refStr}'";
			return false;
		}
	}
}
