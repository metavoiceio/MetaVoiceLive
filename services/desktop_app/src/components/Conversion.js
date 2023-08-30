import React, { useEffect, useState } from "react";
import Form from "react-bootstrap/Form";
import FloatingLabel from "react-bootstrap/FloatingLabel";
import Container from "react-bootstrap/Container";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import Loading from "./Loading";
import InputGroup from "react-bootstrap/InputGroup";
import Stack from "react-bootstrap/Stack";
import Accordion from "react-bootstrap/Accordion";
import './Conversion.css';
import PreferencesModal, { settingsAtom } from "./PreferencesModal";
import { SERVER_BASE_URL } from "../constants";
import SessionFeedbackModal from "./SessionFeedbackModal";
import posthog from "posthog-js";
import { useAtom } from "jotai";
import Speaker from "./Speaker";
import logoImage from "../../assets/MetaVoice Live Logo - Dark Transparent.png";
import { getSpeakers } from "../api";

var framesError = true;

export default function Conversion({ email, issuer }) {
  const [settings, setSettings] = useAtom(settingsAtom);
  const [deviceMap, setDeviceMap] = useState();
  const [isServerOnline, setIsServerOnline] = useState(false);
  const [buttonClicked, setButtonClicked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversionRunning, setConversionRunning] = useState(false);
  // audio states
  const [originalAudio, setOriginalAudio] = useState(null);
  const [convertedAudio, setConvertedAudio] = useState(null);
  const [hackFramesError, setFramesError] = useState(true);
  const [speakers, setSpeakers] = useState([]);

  useEffect(() => {
    (async () => {
      // using effect instead of memo so we can display loading screen
      const speakers = await getSpeakers();

      if (speakers.length === 0) {
        throw new Error("No speakers found");
      }

      setSpeakers(speakers);
    })()
  }, []);

  const registerUserWithServer = () => {
    // TODO sidroopdaska: refactor into a singular settings object
    const cached = window.localStorage.getItem("MV_SHARE_DATA");
    const shareData = cached ? cached === "true" : true;

    fetch(
      [
        SERVER_BASE_URL,
        "/register-user",
        "?email=", email,
        "&issuer=", issuer,
        "&share_data=", shareData,
        "&noise_suppression=", settings['noise-suppression-threshold'],
        "&callback_latency_ms_=", settings['callback-latency-ms'],
      ].join(""),
      { method: "GET" }
    ).catch((error) => {
      console.log(`register user failed: ${error}`);
    });

    posthog.capture("user registered with server", {
      email: email,
      issuer: issuer,
      shareData: shareData,
      ...settings,
    });
  };

  const checkServerIsOnline = () => {
    fetch(`${SERVER_BASE_URL}/is-alive`, { method: "GET" })
      .then((_response) => {
        console.log("server online");

        registerUserWithServer();
        setIsServerOnline(true);
      })
      .catch((error) => {
        console.log("server offline", error);
        setTimeout(checkServerIsOnline, 2000);
      });
  };

  useEffect(() => {
    if (isServerOnline) return;
    checkServerIsOnline();
  }, []);

  const fetchDeviceMap = () => {
    fetch(`${SERVER_BASE_URL}/device-map?mode=prod`, { method: "GET" })
      .then((response) => {
        if (!response.ok) throw Error(response.statusText);
        return response.json();
      })
      .then((data) => {
        setDeviceMap(data);
      })
      .catch((error) => {
        console.log(`Error: ${error}`);
      });
  };

  useEffect(() => {
    // Fetch the device map when the server comes online
    if (!isServerOnline) return;
    fetchDeviceMap();
    var ws = new WebSocket("ws://127.0.0.1:58000/ws-frame-health");
    ws.onerror = (error) => {
      console.log(error);
    };
    ws.onmessage = function (event) {
      if (JSON.parse(event.data)[0] == 0) {
        framesError = false;
        setFramesError(false);
      } else {
        framesError = true;
        setFramesError(true);
      }
    };
  }, [isServerOnline]);

  const renderDeviceSelect = (mode) => {
    // mode can be inputs/outputs
    let optionsList = [
      <option key={`${mode}--1`} value={-1}>
        Choose...
      </option>,
    ];
    if (deviceMap) {
      deviceMap[mode].forEach((device) => {
        optionsList.push(
          <option
            key={`${mode}-${device["index"]}`}
            value={device["index"]}
          >
            {device["name"]}
          </option>
        );
      });
    }

    return optionsList;
  };

  const handleInputDeviceChange = (event) => {
    setSettings({ ...settings, inputDeviceId: event.target.value })
  };

  const handleOutputDeviceChange = (event) => {
    setSettings({ ...settings, outputDeviceId: event.target.value })
  };

  const handleTargetSpeakerChange = (idx) => {
    setSettings({ ...settings, targetSpeakerId: idx })
  };

  const handleButtonClick = () => {
    let buttonClickedNewState = !buttonClicked;

    if (buttonClickedNewState) {
      convertStartTime = Date.now();
      posthog.capture("user requested conversion start", {
        email: email,
        appVersion: process.env.npm_package_version,
        targetSpeaker: settings.targetSpeakerId,
      });
      fetch(
        [
          SERVER_BASE_URL,
          "/start-convert",
          "?input_device_idx=", settings.inputDeviceId,
          "&output_device_idx=", settings.outputDeviceId,
          "&app_version=", process.env.npm_package_version,
          "&target_speaker=", settings.targetSpeakerId,
        ].join(""),
        { method: "GET", keepalive: true }
      )
        .then((_response) => {
          setIsProcessing(false);
          // TODO: @sidroopdaska, add comment - why did we move setButtonClicked(buttonClickedNewState) inside
          //       each of these statements, instead of after it?
          setButtonClicked(buttonClickedNewState);
          setConversionRunning(true);

          posthog.capture("user started conversion", {
            email: email,
            appVersion: process.env.npm_package_version,
            targetSpeaker: settings.targetSpeakerId,
          });
        })
        .catch((error) => {
          // TODO: toast, send auth info
          console.log(error);
          posthog.capture("user conversion start failed", {
            email: email,
            appVersion: process.env.npm_package_version,
            targetSpeaker: settings.targetSpeakerId,
            error: error,
          });
          setIsProcessing(false);
          setButtonClicked(buttonClickedNewState);
        });
    } else {
      posthog.capture("user requested conversion stop", {
        email: email,
        appVersion: process.env.npm_package_version,
        targetSpeaker: settings.targetSpeakerId,
      });
      fetch(`${SERVER_BASE_URL}/stop-convert`, {
        method: "GET",
        keepalive: true,
      })
        .then(async (_response) => {
          let latencyRecord = null;
          try {
            // TODO: below works,
            latencyRecord = await _response.json();
            latencyRecord = latencyRecord["latency_records"];
          } catch (error) {
            latencyRecord = error;
            console.log(error);
          }

          posthog.capture("user stopped conversion", {
            email: email,
            appVersion: process.env.npm_package_version,
            targetSpeaker: settings.targetSpeakerId,
            latencyRecord: latencyRecord,
          });
          setConversionRunning(false);

          let responses = await Promise.all([
            fetch(`${SERVER_BASE_URL}/audio?audio_type=original`, {
              method: "GET",
            }),
            fetch(`${SERVER_BASE_URL}/audio?audio_type=converted`, {
              method: "GET",
            }),
          ]);
          let originalBlob = await responses[0].blob();
          let convertedBlob = await responses[1].blob();

          const originalBlobUrl = URL.createObjectURL(originalBlob);
          setOriginalAudio(originalBlobUrl);
          setConvertedAudio(URL.createObjectURL(convertedBlob));

          getBlobDuration(originalBlobUrl).then((duration) => {
            posthog.capture("user conversion processed", {
              email: email,
              appVersion: process.env.npm_package_version,
              targetSpeaker: settings.targetSpeakerId,
              latencyRecord: latencyRecord,
              duration,
            })
          });

          setIsProcessing(false);
          setButtonClicked(buttonClickedNewState);
        })
        .catch((error) => {
          posthog.capture("user conversion stop failed", {
            email: email,
            appVersion: process.env.npm_package_version,
            targetSpeaker: settings.targetSpeakerId,
            error: error,
          });
          console.log(error);
          setIsProcessing(false);
          setButtonClicked(buttonClickedNewState);
        });
    }

    setIsProcessing(true);
  };

  const renderAudioAccordion = () => {
    return (
      <Accordion className="mv-accordion">
        <Accordion.Item eventKey="0">
          <Accordion.Header>Review &#38; Share Session</Accordion.Header>
          <Accordion.Body>
            <div className="d-flex justify-content-between">
              <figure>
                <figcaption className="text-center">
                  Original Identity
                </figcaption>
                <audio src={originalAudio} controls />
              </figure>
              <figure>
                <figcaption className="text-center">Target Identity</figcaption>
                <audio src={convertedAudio} controls />
              </figure>
            </div>
            <SessionFeedbackModal
              shouldDisableButton={!originalAudio && !convertedAudio}
            />
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    );
  };

  return (
    <>
      <Loading
        isActive={!isServerOnline || speakers.length === 0}
        text="Preparing your voice, please wait..."
      />
      <Container className="conversion-header">
        <img
          src={logoImage}
          alt="logo"
          className="conversion-header-logo"
          height={64}
        />
        <div className="conversion-header-settings mb-5 align-items-start">
          <Stack direction="horizontal" gap={2}>
            {/* TODO: reinstate in the future */}
            {/* <Badge pill bg="danger">Founding Member</Badge> */}
            <PreferencesModal />
          </Stack>
        </div>
      </Container>
      <Container className="conversion-container">
        {conversionRunning && (
          <div style={{ textAlign: "right", fontSize: "0.8rem" }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              fill={framesError ? "red" : "green"}
              className="bi bi-record-fill"
              viewBox="0 0 18 18"
            >
              <path
                fill-rule="evenodd"
                d="M8 13A5 5 0 1 0 8 3a5 5 0 0 0 0 10z"
              />
            </svg>
            {framesError ? "Frames dropping" : "Frames OK"}
          </div>
        )}
        <div className="mt-1 d-flex align-center justify-content-center">
          {/* # TODO (outdated?): add button handlers for actions on each voice */}
          {speakers.map((speaker) => {
            return (
              <Speaker
                key={speaker.id}
                name={speaker.name}
                avatar={speaker.avatar}
                onClick={() => {
                  handleTargetSpeakerChange(speaker.id);
                }}
                disabled={buttonClicked || isProcessing}
                selected={settings.targetSpeakerId === speaker.id}
              />
            )
          })}
        </div>

        <div className="d-flex justify-content-around align-items-center">
          <InputGroup size="lg">
            <InputGroup.Text>
              <i className="bi bi-mic"></i>
            </InputGroup.Text>
            <FloatingLabel
              label="Input"
              className="floating-label flex-grow-1 "
            >
              <Form.Select
                onClick={fetchDeviceMap}
                onChange={handleInputDeviceChange}
                disabled={buttonClicked || isProcessing}
                value={settings.inputDeviceId}
              >
                {renderDeviceSelect("inputs")}
              </Form.Select>
            </FloatingLabel>
          </InputGroup>
          <div className="icon-wrapper p-4">
            <i className="bi bi-arrow-right-short"></i>
          </div>
          <InputGroup size="lg">
            <InputGroup.Text>
              <i className="bi bi-megaphone"></i>
            </InputGroup.Text>
            <FloatingLabel
              label="Output"
              className="floating-label flex-grow-1 "
            >
              <Form.Select
                onClick={fetchDeviceMap}
                onChange={handleOutputDeviceChange}
                disabled={buttonClicked || isProcessing}
                value={settings.outputDeviceId}
              >
                {renderDeviceSelect("outputs")}
              </Form.Select>
            </FloatingLabel>
          </InputGroup>
        </div>

        <div className="mt-4 d-flex justify-content-center">
          <Button
            onClick={handleButtonClick}
            variant={buttonClicked && !isProcessing ? "danger" : "primary"}
            className="col-5 p-3"
            disabled={settings.inputDeviceId < 0 || settings.outputDeviceId < 0 || isProcessing}
          >
            {isProcessing ? (
              <Spinner
                as="span"
                animation="border"
                size="sm"
                variant="light"
                className="spinner-border"
              />
            ) : (
              buttonClicked && (
                <Spinner
                  as="span"
                  animation="grow"
                  size="sm"
                  variant="light"
                  className="spinner-border"
                />
              )
            )}
            <span className="mx-2">
              {isProcessing
                ? "Please Wait"
                : buttonClicked
                ? "Stop Conversion"
                : "Start Conversion"}
            </span>
          </Button>
        </div>
        {renderAudioAccordion()}
      </Container>
    </>
  );
}

// modified from https://github.com/evictor/get-blob-duration/blob/master/src/getBlobDuration.js
function getBlobDuration(blobUrl) {
  const tempVideoEl = document.createElement('video')

  const durationP = new Promise((resolve, reject) => {
    tempVideoEl.addEventListener('loadedmetadata', () => {
      // Chrome bug: https://bugs.chromium.org/p/chromium/issues/detail?id=642012
      if(tempVideoEl.duration === Infinity) {
        tempVideoEl.currentTime = Number.MAX_SAFE_INTEGER
        tempVideoEl.ontimeupdate = () => {
          tempVideoEl.ontimeupdate = null
          resolve(tempVideoEl.duration)
          tempVideoEl.currentTime = 0
        }
      }
      // Normal behavior
      else
        resolve(tempVideoEl.duration)
    })
    tempVideoEl.onerror = (event) => reject(event.target.error)
  })

  tempVideoEl.src = blobUrl;

  return durationP
}