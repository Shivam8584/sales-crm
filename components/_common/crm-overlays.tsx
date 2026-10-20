import CompanyDetail from "@/components/companies/detail/company-detail";
import Profile from "@/components/companies/profile/profile";
import NewCompanyDialog from "@/components/companies/new-company/new-company-dialog";
import CommandMenu from "@/components/companies/command-menu/command-menu";
import ShortcutsDialog from "@/components/companies/shortcuts-dialog";

/** Sheets and dialogs that any CRM page can open through the store. */
export default function CrmOverlays() {
  return (
    <>
      <CompanyDetail />
      <Profile />
      <NewCompanyDialog />
      <CommandMenu />
      <ShortcutsDialog />
    </>
  );
}
