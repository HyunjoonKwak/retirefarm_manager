"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  User,
  Shield,
  Database,
  Loader2,
  Download,
  Trash2,
  LogOut,
  Calendar,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils/format";

interface Profile {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export function SettingsManager() {
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // 프로필 수정
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // 비밀번호 변경
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // 데이터 내보내기
  const [isExporting, setIsExporting] = useState(false);

  // 계정 삭제
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function fetchProfile() {
    try {
      const response = await fetch("/api/settings/profile");
      const data = await response.json();
      setProfile(data.profile);
      if (data.profile?.name) {
        setProfileName(data.profile.name);
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  async function handleUpdateProfile() {
    if (!profileName.trim()) {
      toast.error("이름을 입력해주세요.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "프로필 수정에 실패했습니다.");
      } else {
        toast.success("프로필이 수정되었습니다.");
        setProfile(result.profile);
        setIsProfileDialogOpen(false);
        // 세션 업데이트
        await updateSession({ name: profileName });
      }
    } catch {
      toast.error("프로필 수정 중 오류가 발생했습니다.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error("모든 항목을 입력해주세요.");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "비밀번호 변경에 실패했습니다.");
      } else {
        toast.success("비밀번호가 변경되었습니다.");
        setIsPasswordDialogOpen(false);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch {
      toast.error("비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleExportData() {
    setIsExporting(true);
    try {
      const response = await fetch("/api/settings/data");
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "데이터 내보내기에 실패했습니다.");
        return;
      }

      // JSON 파일로 다운로드
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `retirefarm_data_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("데이터가 내보내기되었습니다.");
    } catch {
      toast.error("데이터 내보내기 중 오류가 발생했습니다.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "삭제") {
      toast.error("'삭제'를 입력해주세요.");
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/settings/data", {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "계정 삭제에 실패했습니다.");
      } else {
        toast.success("계정이 삭제되었습니다.");
        signOut({ callbackUrl: "/" });
      }
    } catch {
      toast.error("계정 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            프로필
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            보안
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            데이터
          </TabsTrigger>
        </TabsList>

        {/* 프로필 탭 */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>프로필 정보</CardTitle>
              <CardDescription>계정 정보를 확인하고 수정합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    이메일
                  </Label>
                  <p className="font-medium">{profile?.email}</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    이름
                  </Label>
                  <p className="font-medium">{profile?.name || "-"}</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    가입일
                  </Label>
                  <p className="font-medium">{profile?.createdAt ? formatDate(profile.createdAt) : "-"}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setIsProfileDialogOpen(true)}>프로필 수정</Button>
                <Button variant="outline" onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 보안 탭 */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>보안 설정</CardTitle>
              <CardDescription>비밀번호를 변경하고 계정 보안을 관리합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">비밀번호 변경</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    정기적으로 비밀번호를 변경하여 계정을 안전하게 보호하세요.
                  </p>
                  <Button onClick={() => setIsPasswordDialogOpen(true)}>비밀번호 변경</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 데이터 탭 */}
        <TabsContent value="data">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>데이터 내보내기</CardTitle>
                <CardDescription>모든 데이터를 JSON 파일로 내보냅니다.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  은퇴 계획, 자산, 영농일지, 재무 기록 등 모든 데이터를 백업합니다.
                </p>
                <Button onClick={handleExportData} disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  데이터 내보내기
                </Button>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">계정 삭제</CardTitle>
                <CardDescription>
                  계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  계정 삭제
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* 프로필 수정 다이얼로그 */}
      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로필 수정</DialogTitle>
            <DialogDescription>이름을 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="이름을 입력하세요"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleUpdateProfile} disabled={isSavingProfile}>
              {isSavingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 비밀번호 변경 다이얼로그 */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비밀번호 변경</DialogTitle>
            <DialogDescription>새로운 비밀번호를 설정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>현재 비밀번호</Label>
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>새 비밀번호</Label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">8자 이상 입력해주세요.</p>
            </div>
            <div className="space-y-2">
              <Label>비밀번호 확인</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleChangePassword} disabled={isChangingPassword}>
              {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              변경
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 계정 삭제 확인 다이얼로그 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 계정을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                계정을 삭제하면 다음 데이터가 모두 삭제됩니다:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>은퇴 계획 및 목표</li>
                <li>부동산 자산 정보</li>
                <li>스마트팜 설립 비용 계획</li>
                <li>영농일지 및 작물 기록</li>
                <li>재무 기록</li>
                <li>재고 관리 데이터</li>
              </ul>
              <p className="font-medium text-destructive">
                이 작업은 되돌릴 수 없습니다.
              </p>
              <div className="space-y-2 mt-4">
                <Label>확인을 위해 &apos;삭제&apos;를 입력해주세요:</Label>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="삭제"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm("")}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirm !== "삭제"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              계정 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
