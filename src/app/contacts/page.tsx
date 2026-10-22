"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  paginateContacts,
  filterContacts,
} from "@/store/slices/contactsSlice";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ChatLayout } from "@/components/layout/ChatLayout";
import { Users, Plus, Search, Edit, Trash2, Copy, QrCode } from "lucide-react";
import { formatAddress } from "@/utils/format";
import { Contact, CreateContactRequest } from "@/types";
import { PAGINATION } from "@/constants";
import {
  buildClipboardFallbackMessage,
  copyTextToClipboard,
} from "@/utils/clipboard";
import toast from "react-hot-toast";

const createEmptyContactForm = (): CreateContactRequest => ({
  name: "",
  address: "",
  tokenType: "STRK",
  note: "",
});

export default function ContactsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { list: contacts, isLoading } = useAppSelector(
    (state) => state.contacts,
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [contactsPage, setContactsPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddressChangeConfirmationOpen, setIsAddressChangeConfirmationOpen] =
    useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<CreateContactRequest>(
    createEmptyContactForm(),
  );

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }

    void dispatch(getContacts());
  }, [dispatch, isAuthenticated, router]);

  const filteredContacts = filterContacts(contacts, searchTerm);
  const pageCount = Math.ceil(
    filteredContacts.length / PAGINATION.CONTACTS_PAGE_SIZE,
  );
  const currentContactsPage = Math.min(contactsPage, Math.max(1, pageCount));
  const visibleContacts = paginateContacts(
    filteredContacts,
    currentContactsPage,
  );

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await dispatch(
        createContact({
          ...formData,
          note: formData.note?.trim() || undefined,
        }),
      ).unwrap();

      toast.success("Contact created successfully!");
      setIsCreateModalOpen(false);
      setFormData(createEmptyContactForm());
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || "Failed to create contact");
      toast.error(errorMessage);
    }
  };

  const persistContactUpdate = async () => {
    if (!editingContact) return;

    try {
      await dispatch(
        updateContact({
          id: editingContact.id,
          data: {
            ...formData,
            note: formData.note?.trim() || undefined,
          },
        }),
      ).unwrap();

      toast.success("Contact updated successfully!");
      setIsEditModalOpen(false);
      setIsAddressChangeConfirmationOpen(false);
      setEditingContact(null);
      setFormData(createEmptyContactForm());
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || "Failed to update contact");
      toast.error(errorMessage);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;

    if (formData.address.trim() !== editingContact.address) {
      setIsAddressChangeConfirmationOpen(true);
      return;
    }

    await persistContactUpdate();
  };

  const cancelAddressChange = () => {
    if (editingContact) {
      setFormData((current) => ({
        ...current,
        address: editingContact.address,
      }));
    }

    setIsAddressChangeConfirmationOpen(false);
  };

  const handleDeleteContact = async (contact: Contact) => {
    if (!window.confirm(`Are you sure you want to delete ${contact.name}?`))
      return;

    try {
      await dispatch(deleteContact(contact.id)).unwrap();
      toast.success("Contact deleted successfully!");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || "Failed to delete contact");
      toast.error(errorMessage);
    }
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      address: contact.address,
      tokenType: contact.tokenType,
      note: contact.note ?? "",
    });
    setIsEditModalOpen(true);
    setIsAddressChangeConfirmationOpen(false);
  };

  const copyToClipboard = async (text: string, label: string) => {
    const result = await copyTextToClipboard(text, label);

    if (result.ok) {
      toast.success(`${label} copied to clipboard`);
      return;
    }

    toast.error(result.fallbackMessage || buildClipboardFallbackMessage(label));
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-32 w-32 animate-spin rounded-full border-b-2 border-primary-600" />
          <p className="mt-4 text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout>
      <div className="relative flex h-full flex-col overflow-hidden bg-black text-white">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Your Contacts</h2>
                <p className="text-gray-300">
                  {contacts.length} contact{contacts.length !== 1 ? "s" : ""}{" "}
                  total
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setContactsPage(1);
                  }}
                  className="w-full pl-10 sm:w-64"
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
              <p className="mt-4 text-gray-300">Loading contacts...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden="true" className="h-8 w-8" />}
              title={searchTerm ? "No contacts found" : "No contacts yet"}
              description={
                searchTerm
                  ? "Try another name or address."
                  : "Save a contact to make future transfers easier."
              }
              action={
                !searchTerm
                  ? {
                      label: "Add your first contact",
                      onClick: () => setIsCreateModalOpen(true),
                      icon: <Plus aria-hidden="true" className="h-4 w-4" />,
                    }
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visibleContacts.map((contact) => (
                <Card key={contact.id}>
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {contact.name}
                      </h3>
                      <p className="text-sm text-gray-300">
                        {contact.tokenType}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${contact.name}`}
                        onClick={() => openEditModal(contact)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${contact.name}`}
                        onClick={() => void handleDeleteContact(contact)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-sm font-medium text-gray-300">
                        Address
                      </p>
                      <div className="flex items-center space-x-2">
                        <code className="flex-1 rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-700">
                          {formatAddress(contact.address)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Copy ${contact.name} address`}
                          onClick={() =>
                            void copyToClipboard(contact.address, "Address")
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {contact.note && (
                      <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                          Note
                        </p>
                        <p className="break-words whitespace-pre-wrap text-sm text-gray-200">
                          {contact.note}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Added {new Date(contact.createdAt).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Generate QR code for ${contact.name}`}
                        className="text-gray-300 hover:text-white"
                        onClick={() => toast("QR code generation coming soon!")}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && pageCount > 1 && (
            <nav
              className="mt-6 flex items-center justify-center gap-4"
              aria-label="Contacts pages"
            >
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentContactsPage === 1}
                onClick={() => setContactsPage(currentContactsPage - 1)}
                aria-label="Previous contacts page"
              >
                Previous
              </Button>
              <span aria-live="polite" className="text-sm text-gray-300">
                Page {currentContactsPage} of {pageCount}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentContactsPage === pageCount}
                onClick={() => setContactsPage(currentContactsPage + 1)}
                aria-label="Next contacts page"
              >
                Next
              </Button>
            </nav>
          )}
        </div>

        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Add New Contact"
        >
          <form onSubmit={handleCreateContact} className="space-y-4">
            <Input
              label="Name"
              placeholder="Enter contact name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />

            <Input
              label="Address"
              placeholder="Enter Stellar address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              required
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Token Type
              </label>
              <select
                value={formData.tokenType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tokenType: e.target
                      .value as CreateContactRequest["tokenType"],
                  })
                }
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                <option value="STRK">STRK</option>
                <option value="XLM">XLM</option>
                <option value="ETH">ETH</option>
                <option value="DAI">DAI</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Note
              </label>
              <textarea
                value={formData.note ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                rows={3}
                maxLength={280}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Optional private note for this contact"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Add Contact</Button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setIsAddressChangeConfirmationOpen(false);
          }}
          title={
            isAddressChangeConfirmationOpen
              ? "Confirm Address Change"
              : "Edit Contact"
          }
        >
          {isAddressChangeConfirmationOpen && editingContact ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Changing this destination can redirect future payments to a
                different account. Confirm the new address before saving.
              </p>

              <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Current address
                  </p>
                  <code className="break-all text-sm">
                    {formatAddress(editingContact.address)}
                  </code>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    New address
                  </p>
                  <code className="break-all text-sm">
                    {formatAddress(formData.address.trim())}
                  </code>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={cancelAddressChange}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void persistContactUpdate()}
                >
                  Confirm destination change
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpdateContact} className="space-y-4">
              <Input
                label="Name"
                placeholder="Enter contact name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />

              <Input
                label="Address"
                placeholder="Enter Stellar address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                required
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Token Type
                </label>
                <select
                  value={formData.tokenType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tokenType: e.target
                        .value as CreateContactRequest["tokenType"],
                    })
                  }
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="STRK">STRK</option>
                  <option value="XLM">XLM</option>
                  <option value="ETH">ETH</option>
                  <option value="DAI">DAI</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Note
                </label>
                <textarea
                  value={formData.note ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, note: e.target.value })
                  }
                  rows={3}
                  maxLength={280}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="Optional private note for this contact"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Update Contact</Button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </ChatLayout>
  );
}
