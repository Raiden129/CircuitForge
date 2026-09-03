#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace CircuitForge.Editor
{
	public static class BuildScript
	{
		public static void TestAPIs()
		{
			PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
			PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] {
				UnityEngine.Rendering.GraphicsDeviceType.WebGPU,
				UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3
			});
			var newApis = PlayerSettings.GetGraphicsAPIs(BuildTarget.WebGL);
			Debug.Log($"[APIs] New WebGL APIs: {string.Join(", ", newApis)}");
		}

		public static void BuildWebGL()
		{
			string projectRoot = Directory.GetParent(Application.dataPath).FullName;
			string buildPath = Path.GetFullPath(Path.Combine(projectRoot, "../web/public/unity"));

			if (!Directory.Exists(buildPath))
			{
				Directory.CreateDirectory(buildPath);
			}

			Debug.Log($"[CircuitForge.Editor] Output path: {buildPath}");

			EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
			PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
			PlayerSettings.WebGL.threadsSupport = false;

			string[] scenes = new[] { "Assets/Build/DLS.unity" };

			BuildPlayerOptions buildPlayerOptions = new()
			{
				scenes = scenes,
				locationPathName = buildPath,
				target = BuildTarget.WebGL,
				options = BuildOptions.None
			};

			BuildReport report = BuildPipeline.BuildPlayer(buildPlayerOptions);
			BuildSummary summary = report.summary;

			if (summary.result == BuildResult.Succeeded)
			{
				Debug.Log($"[CircuitForge.Editor] Build Succeeded! Size={summary.totalSize} bytes Duration={summary.totalTime}");
			}
			else
			{
				Debug.LogError($"[CircuitForge.Editor] Build Failed with result={summary.result} errors={summary.totalErrors}");
				EditorApplication.Exit(1);
			}
		}
	}
}
#endif
