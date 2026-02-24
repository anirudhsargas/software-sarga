export const isTouchDevice = () => {
    return window.matchMedia("(pointer: coarse)").matches;
};

export const adaptiveClick = (handler) => {
    if (isTouchDevice()) {
        return { onClick: handler };
    }
    return { onDoubleClick: handler };
};
