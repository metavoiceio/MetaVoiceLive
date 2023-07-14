import React from 'react';
import './Speaker.css';

export default function Speaker(props) {
    const {
        name,
        avatar = undefined,
        disabled,
        selected,
        onClick,
    } = props;

    return (
        <button
            className={`speaker ${selected && 'speaker--selected'} ${disabled && 'speaker--disabled'}'}`}
            onClick={onClick}
        >
            {avatar
                ? ( <img className="speaker-avatar" src={avatar} alt={name} width={80} height={80} />)
                : ( <div className='speaker-avatar speaker-avatar--placeholder'>{name[0].toUpperCase()}</div> )}
            <div className='speaker-name'>
                {name}
            </div>
        </button>
    );
}