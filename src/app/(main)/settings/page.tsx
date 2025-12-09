import { PageContainer } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Bell, Shield, Database } from "lucide-react";

export default function SettingsPage() {
  return (
    <PageContainer
      title="설정"
      description="계정 및 앱 설정 관리"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              프로필 설정
            </CardTitle>
            <CardDescription>
              이름, 이메일 등 계정 정보를 수정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline">프로필 수정</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              보안 설정
            </CardTitle>
            <CardDescription>
              비밀번호 변경 및 보안 설정을 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline">비밀번호 변경</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              알림 설정
            </CardTitle>
            <CardDescription>
              알림 수신 여부와 방식을 설정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline">알림 설정</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              데이터 관리
            </CardTitle>
            <CardDescription>
              데이터 내보내기/가져오기 및 백업을 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline">데이터 관리</Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
