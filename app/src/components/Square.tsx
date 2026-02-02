import React from 'react';
import "./Square.scss";
import { motion } from "framer-motion";

type SquareProps = {
    ind?: number | string;
    updateSquares?: (index: number | string) => void;
    clsName?: string;
    value?: string; // 'X', 'O', or empty
};

const Square: React.FC<SquareProps> = ({ ind, updateSquares, clsName, value }) => {
    const handleClick = () => {
        if (updateSquares && ind !== undefined && !value) {
            updateSquares(ind);
        }
    };
    
    return (
        <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`square ${value ? 'disabled' : ''}`}
            onClick={handleClick}
        >
            {value && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`${value.toLowerCase()}`}
                >
                    {value}
                </motion.span>
            )}
        </motion.div>
    );
};

export default Square;