import React, { useEffect, useState } from 'react';

type AlertProps = {
    type: 'success' | 'error';
    message: string;
    onClose: () => void;
};

const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
    const [opacity, setOpacity] = useState(0); // Start with 0 opacity for fade-in effect

    useEffect(() => {
        setOpacity(1);

        const fadeOutTimer = setTimeout(() => {
            setOpacity(0);
        }, 3000);

        const removeTimer = setTimeout(() => {
            onClose();
        }, 3500);

        return () => {
            clearTimeout(fadeOutTimer);
            clearTimeout(removeTimer);
        };
    }, [onClose]);

    return (
        <div className={`alert ${type}`} style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            transition: 'opacity 1s ease-in-out',
            opacity: opacity,
            zIndex: 1000,
            maxWidth: '90%',
            wordWrap: 'break-word',
            wordBreak: 'break-word',
            minWidth: '300px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
        }}>
            {message}
        </div>
    );
};

export default Alert;