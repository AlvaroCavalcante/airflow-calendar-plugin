(function (global) {
    const MODAL_WIDTH = 300;
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

    function patchScrollbarBehavior() {
        if (!global.jQuery || !global.jQuery.fn.modal) {
            return;
        }
        const Modal = global.jQuery.fn.modal.Constructor;
        if (!Modal || Modal.__airflowCalendarPatched) {
            return;
        }

        Modal.prototype._setScrollbar = function () {
            this._airflowBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        };

        Modal.prototype._resetScrollbar = function () {
            document.body.style.overflow = this._airflowBodyOverflow || '';
        };

        Modal.__airflowCalendarPatched = true;
    }

    function initEventModal() {
        if (!global.jQuery) {
            return;
        }

        patchScrollbarBehavior();

        const $modal = global.jQuery('#eventModal');
        $modal.modal({ backdrop: true, keyboard: true, show: false });

        $modal.on('click.airflowCalendarDismiss', function (event) {
            if (event.target === event.currentTarget) {
                $modal.modal('hide');
            }
        });

        $modal.on('hidden.bs.modal', function () {
            global.jQuery('.modal-backdrop').remove();
            global.jQuery('body').removeClass('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        });
    }

    function showEventModal(modalDialog, clientX, clientY) {
        positionModalDialog(modalDialog, clientX, clientY);

        const $modal = global.jQuery('#eventModal');
        if ($modal.hasClass('show')) {
            return;
        }

        global.jQuery('.modal-backdrop').remove();
        $modal.modal('show');
    }

    global.AirflowCalendarModal = {
        init: initEventModal,
        show: showEventModal,
    };
}(window));
