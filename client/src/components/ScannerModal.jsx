import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

const ScannerModal = ({ isOpen, onClose, onScan }) => {
    useEffect(() => {
        if (!isOpen) return;

        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );

        const onSuccess = (decodedText) => {
            onScan(decodedText);
            scanner.clear().then(() => {
                onClose();
            }).catch(err => {
                console.error("Failed to clear scanner on success", err);
                onClose();
            });
        };

        const onError = (error) => {
            // Silence common scanning errors to avoid spamming the console
        };

        scanner.render(onSuccess, onError);

        return () => {
            // Attempt to clear scanner when component unmounts
            const element = document.getElementById('reader');
            if (element) {
                scanner.clear().catch(err => {
                    // This often fails if already cleared or element removed, which is fine
                });
            }
        };
    }, [isOpen, onScan, onClose]);

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" style={{ zIndex: 1000 }}>
            <div className="modal" style={{ maxWidth: '500px', width: '90%' }}>
                <div className="row space-between items-center mb-16">
                    <h2 className="section-title">Scan Code</h2>
                    <button className="icon-button" onClick={onClose}><X size={20} /></button>
                </div>
                <div id="reader" style={{ width: '100%' }}></div>
                <p className="muted text-center mt-16 text-sm">
                    Position the QR code or product code within the frame to scan.
                </p>
            </div>
        </div>
    );
};

export default ScannerModal;
