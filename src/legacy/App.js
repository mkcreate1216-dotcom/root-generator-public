import React, { useState } from "react";

const App = () => {
  // State管理
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [waypoints, setWaypoints] = useState([]);
  const [mapType, setMapType] = useState("google");

  // Google Maps URL生成
  const generateGoogleMapsUrl = () => {
    const base = "https://www.google.com/maps/dir/?api=1";
    const validWaypoints = waypoints.map((wp) => wp.trim()).filter(Boolean);
    const wp = validWaypoints.map(encodeURIComponent).join("|");
    return `${base}&origin=${encodeURIComponent(origin.trim())}&destination=${encodeURIComponent(
      destination.trim()
    )}${wp ? `&waypoints=${wp}` : ""}`;
  };

  // Apple Maps URL生成
  const generateAppleMapsUrl = () => {
    const originTrimmed = origin.trim();
    const destTrimmed = destination.trim();
    const validWaypoints = waypoints.map((wp) => wp.trim()).filter(Boolean);
    const originEncoded = encodeURIComponent(originTrimmed);
    const destEncoded = encodeURIComponent(destTrimmed);

    if (validWaypoints.length > 0) {
      const waypointsParams = validWaypoints
        .map((wp) => `waypoint=${encodeURIComponent(wp)}`)
        .join("&");
      return `https://maps.apple.com/directions?source=${originEncoded}&destination=${destEncoded}&${waypointsParams}`;
    }
    return `https://maps.apple.com/?saddr=${originEncoded}&daddr=${destEncoded}`;
  };

  // 寄り道追加
  const addWaypoint = () => {
    setWaypoints([...waypoints, ""]);
  };

  // 寄り道削除
  const removeWaypoint = (index) => {
    const updatedWaypoints = [...waypoints];
    updatedWaypoints.splice(index, 1);
    setWaypoints(updatedWaypoints);
  };

  // 入力変更時のハンドラー
  const updateWaypoint = (index, value) => {
    const updatedWaypoints = [...waypoints];
    updatedWaypoints[index] = value;
    setWaypoints(updatedWaypoints);
  };

  // 地図アプリ遷移用
  const openUrl = (url) => {
    window.location.href = url;
  };

  return (
    <div style={{ padding: "16px", fontFamily: "Arial, sans-serif" }}>
      <h1>寄り道ルート作成</h1>
      <div>
        <label>
          出発地: <br />
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="例: 東京駅"
            style={{ width: "100%", marginBottom: "8px" }}
          />
        </label>
      </div>
      <div>
        <label>
          目的地: <br />
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="例: 新大阪駅"
            style={{ width: "100%", marginBottom: "8px" }}
          />
        </label>
      </div>
      <div>
        <label>
          寄り道:
          {waypoints.map((wp, index) => (
            <div key={index} style={{ marginBottom: "8px" }}>
              <input
                type="text"
                value={wp}
                onChange={(e) => updateWaypoint(index, e.target.value)}
                placeholder={`寄り道${index + 1}`}
                style={{ width: "80%" }}
              />
              <button
                onClick={() => removeWaypoint(index)}
                style={{
                  marginLeft: "8px",
                  backgroundColor: "red",
                  color: "white",
                  border: "none",
                  padding: "8px",
                  cursor: "pointer"
                }}
              >
                削除
              </button>
            </div>
          ))}
        </label>
        <button
          onClick={addWaypoint}
          style={{
            backgroundColor: "green",
            color: "white",
            border: "none",
            padding: "8px",
            cursor: "pointer"
          }}
        >
          ＋寄り道追加
        </button>
      </div>
      <div
        style={{
          marginTop: "16px",
          padding: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          backgroundColor: "#f8fafc"
        }}
      >
        <div style={{ marginBottom: "8px" }}>
          <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input
              type="radio"
              name="mapType"
              value="google"
              checked={mapType === "google"}
              onChange={(e) => setMapType(e.target.value)}
            />
            Google Maps
          </label>
        </div>
        <div>
          <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input
              type="radio"
              name="mapType"
              value="apple"
              checked={mapType === "apple"}
              onChange={(e) => setMapType(e.target.value)}
            />
            Apple Map
          </label>
        </div>
      </div>
      <button
        onClick={() => {
          if (!origin || !destination) {
            alert("出発地と目的地を入力してください");
            return;
          }
          openUrl(mapType === "apple" ? generateAppleMapsUrl() : generateGoogleMapsUrl());
        }}
        style={{
          marginTop: "12px",
          backgroundColor: "#18181b",
          color: "white",
          border: "none",
          padding: "12px",
          cursor: "pointer",
          width: "100%",
          borderRadius: "6px",
          fontWeight: "bold"
        }}
      >
        {mapType === "apple" ? "Apple Mapで開く" : "Google Mapsで開く"}
      </button>
    </div>
  );
};

export default App;
