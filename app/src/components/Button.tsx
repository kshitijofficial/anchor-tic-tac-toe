import React from 'react';

type ButtonProps = {
    title: string;
    resetGame: () => void;
    disabled?: boolean;
};

const Button: React.FC<ButtonProps> = ({ title, resetGame, disabled = false }) => {
    return (
        <button
            type="button"
            onClick={() => !disabled && resetGame()}
            disabled={disabled}
            className="btn-primary"
        >
            {title}
        </button>
    );
};

export default Button;