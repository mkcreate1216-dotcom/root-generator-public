import React, { useState } from "react";

const App = () => {
// State management
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [waypoints, setWaypoints] = useState([]);

  // Google Maps URL generation
  const generateGoogleMapsUrl = () => {
    const base = "https://www.google.com/maps/dir/?api=1";
    const wp = waypoints.join("|");
    return `${base}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
      destination
    )}&waypoints=${encodeURIComponent(wp)}`;
  };

  // Apple Maps URL generation
  const generateAppleMapsUrl = () => {
    const stops = [...waypoints, destination].join("+to:");
    return `http://maps.apple.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(
      stops
    )}`;
  };

  // Add waypoint
  const addWaypoint = () => {
    setWaypoints([...waypoints, ""]);
  };

  // Remove waypoint
  const removeWaypoint = (index) => {
    const updatedWaypoints = [...waypoints];
    updatedWaypoints.splice(index, 1);
    setWaypoints(updatedWaypoints);
  };

  // Input change handler
  const updateWaypoint = (index, value) => {
    const updatedWaypoints = [...waypoints];
    updatedWaypoints[index] = value;
    setWaypoints(updatedWaypoints);
  };

  // Navigation to map app
  const openUrl = (url) => {
    window.location.href = url;
  };

  return (
    <div style={{ padding: "16px", fontFamily: "Arial, sans-serif" }}>
      <h1>Multi-Stop Route Generator</h1>
      <div>
        <label>
          Departure: <br />
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="e.g. Tokyo Station"
            style={{ width: "100%", marginBottom: "8px" }}
          />
        </label>
      </div>
      <div>
        <label>
          Destination: <br />
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Shin-Osaka Station"
            style={{ width: "100%", marginBottom: "8px" }}
          />
        </label>
      </div>
      <div>
        <label>
          Stops:
          {waypoints.map((wp, index) => (
            <div key={index} style={{ marginBottom: "8px" }}>
              <input
                type="text"
                value={wp}
                onChange={(e) => updateWaypoint(index, e.target.value)}
                placeholder={`Stop ${index + 1}`}
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
                Delete
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
          + Add Stop
        </button>
      </div>
      <button
        onClick={() =>
          origin && destination
            ? openUrl(generateGoogleMapsUrl())
            : alert("Please enter both departure and destination")
        }
        style={{
          marginTop: "16px",
          backgroundColor: "#4285F4",
          color: "white",
          border: "none",
          padding: "12px",
          cursor: "pointer",
          width: "100%"
        }}
      >
        Open in Google Maps
      </button>
      <button
        onClick={() =>
          origin && destination
            ? openUrl(generateAppleMapsUrl())
            : alert("Please enter both departure and destination")
        }
        style={{
          marginTop: "8px",
          backgroundColor: "#000",
          color: "white",
          border: "none",
          padding: "12px",
          cursor: "pointer",
          width: "100%"
        }}
      >
        Open in Apple Maps
      </button>
    </div>
  );
};

export default App;
