import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { atom, useAtom } from "jotai";
import {
  shutdown as shutdownIntercom
} from "../intercom";
import { SERVER_BASE_URL } from '../constants';
import { supabase } from "../supabase";
import posthog from 'posthog-js';
import './PreferencesModal.css'

const getInitialSettings = () => {
  function createSetting(name, defaultValue, transform = (x) => x) {
    const raw = window.localStorage.getItem('setting:' + name);
    return {
      [name]: raw == null ? defaultValue : transform(raw)
    }
  }
  return {
    ...createSetting('noise-suppression-threshold', 5, Number),
    ...createSetting('callback-latency-ms', 400, Number),
    ...createSetting('targetSpeakerId', 'zeus', String),
    ...createSetting('inputDeviceId', -1, Number),
    ...createSetting('outputDeviceId', -1, Number),
  };
}

// don't use this directly, it doesn't have persistence
const _settingsAtomRaw = atom(getInitialSettings());
// this persists changes to localstorage, loaded back in by getInitialSettings
export const settingsAtom = atom(
  (get) => get(_settingsAtomRaw),
  (get, set, newSettings) => {
    set(_settingsAtomRaw, newSettings)

    // save to localStorage
    Object.keys(newSettings).forEach((key) => {
      window.localStorage.setItem('setting:' + key, newSettings[key]);
    });
  }
)

export const appVersionAtom = atom('0.0.0');

export default function PreferencesModal() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [settings, setSettings] = useAtom(settingsAtom);
  const [shareData, setShareData] = useState(true);

  const [appVersion, setAppVersion] = useAtom(appVersionAtom)

  useEffect(() => {
    const value = window.localStorage.getItem('MV_SHARE_DATA');
    setShareData(value ? value === 'true' : true);

    window.electronAPI.getAppVersion().then((version) => {
      setAppVersion(version);
    });
  }, [])

  const handleSettingChange = async (event) => {
    const settingName = event.target.name;
    const value = event.target.value;

    try {
      posthog.capture(`user requested ${settingName} change`, { value });
      await fetch(`${SERVER_BASE_URL}/${settingName}?value=${value}`, { method: 'GET' });
      posthog.capture(`user requested ${settingName} change succeeded`, { value })
    } catch (error) {
      posthog.capture(`user requested ${settingName} change failed`, { value, error })
      console.log(`GET /${settingName} failed with error: ${error}`)
    }

    setSettings({
      ...settings,
      [settingName]: value
    });
  }

  const handleSwitchOnChange = async (event) => {
    const value = event.target.checked;
    try {
      await fetch(`${SERVER_BASE_URL}/data-share?value=${value}`, { method: 'GET' });
      window.localStorage.setItem('MV_SHARE_DATA', value);
    } catch (error) {
      console.log(`GET /data-share failed with error: ${error}`)
    }

    setShareData(value);
  }

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  const logout = useCallback(() => {
    supabase.auth.signOut().then(() => {
      shutdownIntercom();
      posthog.reset();
      navigate("/login");
    });
  }, [navigate]);

  // useful for debugging, and getting users unstuck
  window.logout = logout;

  return <div className="ms-auto">
    <Button variant="secondary" onClick={handleShow}>
      <i className="bi bi-three-dots-vertical"></i>
    </Button>
    <Modal contentClassName="preference-panel-content" show={show} onHide={handleClose} animation={false} centered>
      <Modal.Header className="border-0">
        <Modal.Title>Advanced Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="slider-setting">
          <Form.Label>Noise Supression: {Number(settings['noise-suppression-threshold'] || 0).toFixed(1)}</Form.Label>
          <div className="slider-with-min-max">
            <span>min</span>
            <Form.Range
              name="noise-suppression-threshold"
              min="1"
              max="10"
              step="0.5"
              defaultValue={settings['noise-suppression-threshold']}
              onChange={handleSettingChange}
              className='mb-3'
            />
            <span>max</span>
          </div>
        </div>

        <div className="slider-setting">
          {/* this parameter is half the experienced latency, so is doubled in slider */}
          <Form.Label>Latency: {Number(settings['callback-latency-ms']) * 2}ms</Form.Label>
          <div className="slider-with-min-max">
            <span>min</span>
            <Form.Range
              name="callback-latency-ms"
              min="400"
              max="1200"
              step="100"
              defaultValue={settings['callback-latency-ms']}
              onChange={handleSettingChange}
              className='mb-3'
            />
            <span>max</span>
          </div>
        </div>

        <div className="d-flex">
          <Form.Check
            type="switch"
            label="Opt-in to share data"
            checked={shareData}
            onChange={handleSwitchOnChange}
            className='me-1'
          />
          <OverlayTrigger
            placement='right'
            overlay={
              <Tooltip id={`tooltip-right`}>
                By clicking send, you agree to share your data with MetaVoice striclty for the purposes of providing you a better voice &#38; app experience.
              </Tooltip>
            }
          >

            <i className="bi bi-info-circle-fill"></i>
          </OverlayTrigger>
        </div>


      </Modal.Body>
      <div className="d-flex mt-3 justify-content-center">
        <Button variant="danger" onClick={logout} className="col-3">Sign Out</Button>
      </div>
      <div className="d-flex mt-3 justify-content-center">
        <p
          className="text-description"
          onClick={() => { navigate('/update') }}
        >Version: {appVersion}</p>
      </div>
      <Modal.Footer className="border-0">
        <Button variant="primary" onClick={handleClose} className="col-3">
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  </div >
}
