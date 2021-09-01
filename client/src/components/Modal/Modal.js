import React, { Component } from "react";
import Modal from "react-modal";
import "./Modal.scss";

Modal.setAppElement("#root");

export default class Modal extends Component {
  render() {
    return (
      <Modal
        isOpen={this.state.modal === true}
        className="modal__modal"
        overlayClassName="modal__overlay"
        transparent={true}
      >
        <div className="modal__modal-top">
          <h1 className="modal__modal-item">
            Delete {this.state.deletedItem.productName} from your sensitive
            list?
          </h1>
          <img
            onClick={this.closeModal}
            className="modal__modal-close"
            src={Alert}
            alt="Close Icon"
          />
        </div>
        <div>
          <p className="modal__modal-description">
            Please confirm that you'd like to delete{" "}
            {this.state.deletedItem.productName} from your Sensitive To list.
          </p>
          <img
            className="modal__modal-image"
            src={this.state.deletedItem.image}
            alt="delete item from your yes sensitivity list"
          />
        </div>
        <div className="modal__modal-buttons">
          <button onClick={this.closeModal} className="modal__modal-cancel">
            Cancel
          </button>
          <button
            onClick={this.deleteItemFunc}
            className="modal__modal-confirm"
          >
            Delete
          </button>
        </div>
      </Modal>
    );
  }
}
