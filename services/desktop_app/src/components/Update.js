import React, { useEffect, useState } from "react";
import './Update.css';

import Loading from './Loading'

export default function Update() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    window.electronAPI.getLogs().then((arg) => {
        setLogs(arg);
    });
    window.electronAPI.onLogInfo(({ msg }) => {
        setLogs((logs) => [...logs, { type: 'log', msg }]);
    });
    window.electronAPI.onLogError(({ msg, error }) => {
        setLogs((logs) => [...logs, { type: 'error', msg, error }]);
    });
  }, []);

  return (
    <div className="logs-container">
        <div className="logs-info">
            {logs.length > 0
                ? (
                <>
                  <Loading isActive={true} text='Updating...' fullScreen={false} />
                  <br />
                  An update is required and is being processed. Make sure you have at least 5GB of available space on disk, this may take a few minutes. Please keep this window open, the app will restart by itself once it's done.
                </>
                )
                : (
                <>
                    This is the page where we show logs for updates. There are currently no logs. If you think you are here by mistake, please refresh the page with Ctrl+R'
                </>
                )
            }
        </div>
        <pre className="logs">
            {logs.map((log, i) => {
                if (log.type === 'log') {
                    return <div key={i} className="logs-log">{log.msg}</div>;
                } else {
                    return <div key={i} className="logs-error">{log.msg} {log.error && log.error.toString()}</div>;
                }
            })}
        </pre>
    </div>
  )
}
