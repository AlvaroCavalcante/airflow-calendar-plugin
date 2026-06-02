(function (global) {
    const MODAL_WIDTH = 320;
    const BUFFER = 15;

    function measureModalHeight() {
        const modal = document.getElementById('eventModal');
        const dialog = modal.querySelector('.modal-dialog');

        if (modal.classList.contains('show')) {
            return dialog.offsetHeight;
        }

        modal.classList.add('modal-measuring');
        const height = dialog.offsetHeight;
        modal.classList.remove('modal-measuring');
        return height;
    }

    function computeModalPosition(clientX, clientY, modalHeight) {
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;

        let finalX = clientX + 10;
        if (finalX + MODAL_WIDTH > viewWidth - BUFFER) {
            finalX = clientX - MODAL_WIDTH - 10;
        }

        let finalY = clientY + 10;
        if (finalY + modalHeight > viewHeight - BUFFER) {
            finalY = clientY - modalHeight - 10;
        }
        if (finalY < BUFFER) {
            finalY = BUFFER;
        }
        if (finalY + modalHeight > viewHeight - BUFFER) {
            finalY = viewHeight - modalHeight - BUFFER;
        }

        return { x: finalX, y: finalY };
    }

    function positionModalDialog(modalDialog, clientX, clientY) {
        const height = measureModalHeight();
        const pos = computeModalPosition(clientX, clientY, height);
        modalDialog.style.left = pos.x + 'px';
        modalDialog.style.top = pos.y + 'px';
    }

    function clearModalArtifacts() {
        if (!global.jQuery) {
            return;
        }
        global.jQuery('.modal-backdrop').remove();
        global.jQuery('body').removeClass('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.paddingRight = '';
    }

    function preventBootstrapScrollLock() {
        if (!global.jQuery || !global.jQuery.fn.modal) {
            return;
        }
        const Modal = global.jQuery.fn.modal.Constructor;
        if (!Modal || Modal.__airflowCalendarScrollLockPatched) {
            return;
        }
        Modal.prototype._setScrollbar = function () {};
        Modal.prototype._resetScrollbar = function () {};
        Modal.__airflowCalendarScrollLockPatched = true;
    }

    function initEventModal() {
        if (!global.jQuery) {
            return;
        }

        preventBootstrapScrollLock();

        const $modal = global.jQuery('#eventModal');
        $modal.modal({ backdrop: false, keyboard: true, show: false });

        $modal.on('show.bs.modal shown.bs.modal hidden.bs.modal', clearModalArtifacts);
    }

    function showEventModal(modalDialog, clientX, clientY) {
        positionModalDialog(modalDialog, clientX, clientY);

        const $modal = global.jQuery('#eventModal');
        if ($modal.hasClass('show')) {
            return;
        }

        clearModalArtifacts();
        $modal.modal('show');
    }

    global.AirflowCalendarModal = {
        init: initEventModal,
        show: showEventModal,
    };
}(window));
