import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

interface ApiResponse {
  message: string;
  data: {
    users: Array<{
      id: number;
      name: string;
      email: string;
    }>;
    timestamp: string;
    version: string;
  };
}

function App() {
  const [apiData, setApiData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [autoRefetch, setAutoRefetch] = useState(true);

  const fetchApiData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use localhost:3000 for development, you can make this configurable
      const response = await fetch("http://localhost:3000/api/data");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();
      setApiData(data);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
      console.error("Error fetching API data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch data immediately on component mount
    fetchApiData();

    // Set up interval to fetch data every 5 seconds only if autoRefetch is enabled
    if (!autoRefetch) return;

    const interval = setInterval(fetchApiData, 5000);

    // Cleanup interval on component unmount or when autoRefetch changes
    return () => clearInterval(interval);
  }, [autoRefetch]);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Skew Protection Demo</h1>

      <div className="api-section">
        <h2>Backend API Data</h2>

        <div className="api-controls">
          <button
            onClick={() => setAutoRefetch(!autoRefetch)}
            className={`toggle-btn ${autoRefetch ? "active" : "inactive"}`}
          >
            {autoRefetch ? "⏸️ Disable Auto-Refresh" : "▶️ Enable Auto-Refresh"}
          </button>

          <button
            onClick={fetchApiData}
            disabled={isLoading}
            className="manual-refresh-btn"
          >
            {isLoading ? "🔄 Refreshing..." : "🔄 Manual Refresh"}
          </button>
        </div>

        <div className="api-status">
          <p>
            Auto-refresh:{" "}
            {autoRefetch ? "✅ Enabled (every 5s)" : "❌ Disabled"}
          </p>
          {isLoading && <p>🔄 Loading...</p>}
          {error && <p style={{ color: "red" }}>❌ Error: {error}</p>}
          {lastUpdated && (
            <p style={{ fontSize: "0.8em", color: "#888" }}>
              Last updated: {new Date(lastUpdated).toLocaleTimeString()}
            </p>
          )}
        </div>

        {apiData && (
          <div className="api-data">
            <h3>Message: {apiData.message}</h3>
            <p>
              <strong>Version:</strong> {apiData.data.version}
            </p>
            <p>
              <strong>Server Timestamp:</strong>{" "}
              {new Date(apiData.data.timestamp).toLocaleString()}
            </p>

            <h4>Users:</h4>
            <ul>
              {apiData.data.users.map((user) => (
                <li key={user.id}>
                  <strong>{user.name}</strong> - {user.email}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
