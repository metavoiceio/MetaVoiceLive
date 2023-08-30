import React, { useState } from "react";
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { SERVER_BASE_URL } from '../constants';

// todo error handling
export default function SessionFeedbackModal({shouldDisableButton}) {
    const [show, setShow] = useState(false);
    const [duration, setDuration] = useState(0)  // in seconds
    const [feedback, setFeedback] = useState("")
    const [sendInProgress, setSendInProgress] = useState(false);
    const [error, setError] = useState(null);

    const handleClose = () => {
        if (sendInProgress) return;
        setShow(false);
    }

    const handleShow = () => setShow(true);
    const handleRadioChange = event => setDuration(parseInt(event.target.value));
    const handleTextAreaChange = event => setFeedback(event.target.value);

    const handleSubmit = (_event) => {
        fetch(`${SERVER_BASE_URL}/feedback?content=${feedback}&duration=${duration}`, { method: 'GET', keepalive: true })
            .then(_response => {
                setSendInProgress(false);
                setShow(false);
            }).catch(_error => {
                console.log(_error);
                setError('Something went wrong. Please try again.');
                setSendInProgress(false);
            });
        setSendInProgress(true);
    }

    return <div className="ms-auto">
        <div className="d-flex justify-content-center">
            <Button variant='primary' className="col-4 feedback-btn p-2" onClick={handleShow} disabled={shouldDisableButton}>
                <i className="bi bi-share"></i> Share Feedback
            </Button>
        </div>

        <Modal contentClassName="session-feedback-modal" show={show} onHide={handleClose} animation={false} centered size="lg">
            <Modal.Header className="border-0">
                <Modal.Title>Share Feedback</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form.Control
                    as="textarea"
                    placeholder="What would you like us to improve?"
                    style={{ height: '80px' }}
                    onChange={handleTextAreaChange}
                    maxLength={1024}
                />
                <Form.Group controlId="duration" className="mb-3 mt-3">
                    <Form.Label className="mt-2">Audio length: &nbsp;</Form.Label>
                    <Form.Check
                        inline
                        label="Entire session"
                        value={0}
                        type='radio'
                        checked={duration === 0}
                        onChange={handleRadioChange}
                    />
                    <Form.Check
                        inline
                        label="5 mins"
                        value={300}
                        type='radio'
                        checked={duration === 300}
                        onChange={handleRadioChange}
                    />
                    <Form.Check
                        inline
                        label="30 secs"
                        value={30}
                        type='radio'
                        checked={duration === 30}
                        onChange={handleRadioChange}
                    />
                </Form.Group>
                <Button variant="primary" type="submit" onClick={handleSubmit} disabled={sendInProgress} className="col-3 send-feedback-button">
                    {sendInProgress && <Spinner as='span' animation="border" size='sm' variant="light" className='spinner-border' />}
                    <i className="bi bi-send"></i> Send
                </Button>
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
                {error && <p className="mv-error">{error}</p>}
            </Modal.Body>
        </Modal>
    </div>
}
