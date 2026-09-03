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
