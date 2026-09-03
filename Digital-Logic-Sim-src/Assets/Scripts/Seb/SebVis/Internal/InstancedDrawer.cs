using System.Collections.Generic;
using System.Runtime.InteropServices;
using Seb.Types;
using UnityEngine;
using UnityEngine.Rendering;

namespace Seb.Vis.Internal
{
	// Base class for drawing instanced meshes
	public class InstancedDrawer<T> : Drawer<T> where T : struct
	{
		static readonly int instanceDataID = Shader.PropertyToID("InstanceData");
		static readonly int instanceOffsetID = Shader.PropertyToID("InstanceOffset");
		static readonly int transformOffsetID = Shader.PropertyToID("LayerOffset");
		static readonly int transformScaleID = Shader.PropertyToID("LayerScale");
		static readonly int screenSpaceID = Shader.PropertyToID("useScreenSpace");
		static readonly int instanceDataTexID = Shader.PropertyToID("_InstanceDataTex");
		static readonly int instanceTexWidthID = Shader.PropertyToID("_InstanceTexWidth");
		readonly List<uint> allArgs = new();

#if UNITY_WEBGL && !UNITY_EDITOR
		Texture2D instanceTex;
		Vector4[] pixelBuffer = System.Array.Empty<Vector4>();

		void UpdateInstanceTexture()
		{
			if (allDrawData is not List<ShapeData> shapeList) return;

			int numInstances = shapeList.Count;
			int totalTexels = Mathf.Max(1, numInstances * 4);
			const int texWidth = 1024;
			int texHeight = Mathf.Max(1, Mathf.CeilToInt((float)totalTexels / texWidth));

			if (instanceTex == null || instanceTex.width != texWidth || instanceTex.height < texHeight)
			{
				if (instanceTex != null) Object.Destroy(instanceTex);
				instanceTex = new Texture2D(texWidth, texHeight, TextureFormat.RGBAFloat, false, true);
				instanceTex.filterMode = FilterMode.Point;
				instanceTex.wrapMode = TextureWrapMode.Clamp;
			}

			int neededLength = texWidth * texHeight;
			if (pixelBuffer.Length < neededLength)
			{
				pixelBuffer = new Vector4[neededLength];
			}

			for (int i = 0; i < numInstances; i++)
			{
				ShapeData d = shapeList[i];
				int baseIdx = i * 4;
				pixelBuffer[baseIdx] = new Vector4(d.type, d.a.x, d.a.y, d.b.x);
				pixelBuffer[baseIdx + 1] = new Vector4(d.b.y, d.c, d.maskMin.x, d.maskMin.y);
				pixelBuffer[baseIdx + 2] = new Vector4(d.maskMax.x, d.maskMax.y, 0, 0);
				pixelBuffer[baseIdx + 3] = new Vector4(d.col.r, d.col.g, d.col.b, d.col.a);
			}

			instanceTex.SetPixelData(pixelBuffer, 0);
			instanceTex.Apply(false, false);
		}
#endif

		// Other stuff
		protected readonly Pool<DrawMaterial> materialPool;
		protected readonly Mesh mesh;
		protected readonly Shader shader;

		protected ComputeBuffer argsBuf;

		// State
		protected int groupIndex;

		bool hasSetDataThisFrame;

		// Buffers
		protected ComputeBuffer instanceBuf;

		public InstancedDrawer(Mesh mesh, Shader shader)
		{
			this.mesh = mesh;
			this.shader = shader;
			materialPool = new Pool<DrawMaterial>(() => new DrawMaterial(shader));
		}

		protected override void InitFrame()
		{
			materialPool.ReturnAll();
			groupIndex = 0;
			hasSetDataThisFrame = false;
		}

		protected override void DrawLayer(CommandBuffer cmd, int startIndex, int count, Draw.LayerInfo layerInfo)
		{
#if UNITY_WEBGL && !UNITY_EDITOR
			if (!hasSetDataThisFrame)
			{
				UpdateInstanceTexture();
				hasSetDataThisFrame = true;
			}

			Material mat = materialPool.GetNextAvailableOrCreate().material;
			if (instanceTex != null)
			{
				mat.SetTexture(instanceDataTexID, instanceTex);
				mat.SetInt(instanceTexWidthID, 1024);
			}
			mat.SetInt(instanceOffsetID, startIndex);

			mat.SetVector(transformOffsetID, layerInfo.offset);
			mat.SetFloat(transformScaleID, layerInfo.scale);
			mat.SetInt(screenSpaceID, layerInfo.useScreenSpace ? 1 : 0);

			if (count > 0)
			{
				cmd.DrawMeshInstancedProcedural(mesh, 0, mat, 0, count);
			}
#else
			if (!hasSetDataThisFrame)
			{
				CreateStructuredBuffer(ref instanceBuf, allDrawData);
				InitArgs(layerSizes);
				hasSetDataThisFrame = true;
			}

			int argsByteOffset = sizeof(uint) * 5 * groupIndex;

			Material mat = materialPool.GetNextAvailableOrCreate().material;
			mat.SetBuffer(instanceDataID, instanceBuf);
			mat.SetInt(instanceOffsetID, startIndex);

			mat.SetVector(transformOffsetID, layerInfo.offset);
			mat.SetFloat(transformScaleID, layerInfo.scale);
			mat.SetInt(screenSpaceID, layerInfo.useScreenSpace ? 1 : 0);

			cmd.DrawMeshInstancedIndirect(mesh, 0, mat, 0, argsBuf, argsByteOffset);
#endif

			groupIndex++;
		}

		public override void Release()
		{
			base.Release();
#if UNITY_WEBGL && !UNITY_EDITOR
			if (instanceTex != null)
			{
				Object.Destroy(instanceTex);
				instanceTex = null;
			}
#else
			ReleaseBuffer(instanceBuf);
			ReleaseBuffer(argsBuf);
#endif

			materialPool.ReturnAll();
			while (materialPool.HasAvailable())
			{
				Material mat = materialPool.PurgeNextAvailable().material;
				if (Application.isPlaying) Object.Destroy(mat);
				else Object.DestroyImmediate(mat); //
			}
		}

		protected void InitArgs(List<uint> counts)
		{
			allArgs.Clear();
			for (int i = 0; i < counts.Count; i++)
			{
				if (counts[i] == 0) continue;
				const int subMeshIndex = 0;
				allArgs.Add(mesh.GetIndexCount(subMeshIndex));
				allArgs.Add(counts[i]);
				allArgs.Add(mesh.GetIndexStart(subMeshIndex));
				allArgs.Add(mesh.GetBaseVertex(subMeshIndex));
				// instance offset (NOTE: this apparently behaves inconsistently across different platforms
				// (i.e. not guaranteed to affect the instanceID in shader), so is best to provide an offset value manually via SetInt
				allArgs.Add(0);
			}

			CreateEmptyArgsBuffer(ref argsBuf, counts.Count);
			argsBuf.SetData(allArgs);
		}

		static void CreateEmptyArgsBuffer(ref ComputeBuffer argsBuffer, int numInstances)
		{
			const int stride = sizeof(uint);
			const int numArgsPerInstance = 5;
			int argCount = numInstances * numArgsPerInstance;

			bool createNewBuffer = argsBuffer == null || !argsBuffer.IsValid() || argsBuffer.count != argCount || argsBuffer.stride != stride;
			if (createNewBuffer)
			{
				if (argsBuffer != null)
				{
					argsBuffer.Release();
				}

				argsBuffer = new ComputeBuffer(argCount, stride, ComputeBufferType.IndirectArguments);
			}
		}

		static void CreateStructuredBuffer(ref ComputeBuffer buffer, List<T> data)
		{
			int stride = GetStride();
			bool createNewBuffer = buffer == null || !buffer.IsValid() || buffer.count != data.Count || buffer.stride != stride;
			if (createNewBuffer)
			{
				ReleaseBuffer(buffer);
				buffer = new ComputeBuffer(data.Count, stride);
			}

			buffer.SetData(data);
		}

		static void ReleaseBuffer(ComputeBuffer buffer)
		{
			if (buffer != null) buffer.Release();
		}

		static int GetStride() => Marshal.SizeOf(typeof(T));

		public class DrawMaterial
		{
			public Material material;

			public DrawMaterial()
			{
				material = null;
			}

			public DrawMaterial(Shader shader)
			{
				material = new Material(shader);
			}
		}
	}
}